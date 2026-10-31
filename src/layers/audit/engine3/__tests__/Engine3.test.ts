/**
 * Tests for Notarizer, SegmentCompactor, AuditAlertStreamer and
 * ComplianceExportScheduler.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { AuditStore } from '../../engine/AuditStore';
import { sealRecord, GENESIS_HASH } from '../../engine/HashChain';
import type { AuditRecord, AuditEventInput } from '../../engine/types';
import {
  Notarizer,
  InMemoryAnchorService,
  buildMerkleTree,
  merkleProof,
  verifyMerkleProof,
  GENESIS_ANCHOR,
} from '../Notarizer';
import { SegmentCompactor } from '../SegmentCompactor';
import { AuditAlertStreamer, compileFilter } from '../AlertStreamer';
import { ComplianceExportScheduler } from '../ComplianceExportScheduler';
import { ManualAuditClock3 } from '../types3';

/** Build a valid chain of N sealed records without a store. */
function chain(n: number, startSeq = 1): AuditRecord[] {
  const out: AuditRecord[] = [];
  let prev = GENESIS_HASH;
  for (let i = 0; i < n; i++) {
    const seq = startSeq + i;
    const input: AuditEventInput = {
      actor: `user-${seq}`,
      action: 'doc.read',
      resource: `doc:${seq}`,
      outcome: 'success',
      severity: 'info',
      timestamp: seq * 1000,
    };
    const r = sealRecord(input, {
      seq,
      id: `rec-${seq}`,
      previousHash: prev,
      timestamp: seq * 1000,
      tier: 'hot',
    });
    out.push(r);
    prev = r.hash;
  }
  return out;
}

describe('Merkle tree construction', () => {
  it('single leaf root equals the leaf itself', () => {
    const tree = buildMerkleTree(['aabb']);
    expect(tree.length).toBe(1);
    expect(tree[0]![0]).toBe('aabb');
  });

  it('proof verifies for every leaf position', () => {
    const leaves = ['h1', 'h2', 'h3', 'h4', 'h5']; // odd count exercises promotion
    const tree = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const p = merkleProof(tree, leaves[i]!, i, i + 1);
      expect(verifyMerkleProof(p)).toBe(true);
    }
  });

  it('proof fails for a tampered leaf', () => {
    const tree = buildMerkleTree(['a', 'b', 'c']);
    const p = merkleProof(tree, 'a', 0, 1);
    const bad = { ...p, leaf: 'tampered' };
    expect(verifyMerkleProof(bad)).toBe(false);
  });
});

describe('Notarizer', () => {
  let clock: ManualAuditClock3;
  let service: InMemoryAnchorService;
  let notarizer: Notarizer;

  beforeEach(() => {
    clock = new ManualAuditClock3(10_000);
    service = new InMemoryAnchorService();
    notarizer = new Notarizer({ clock, service });
  });

  it('anchors a record range and returns a receipt', async () => {
    const records = chain(8);
    const a = await notarizer.anchorRange(records);
    expect(a.seq).toBe(1);
    expect(a.fromSeq).toBe(1);
    expect(a.toSeq).toBe(8);
    expect(a.merkleRoot.length).toBe(64);
    expect(a.previousAnchorHash).toBe(GENESIS_ANCHOR);
    expect(service.anchored.length).toBe(1);
    expect(a.receipt.length).toBe(64);
  });

  it('anchors form their own hash chain', async () => {
    await notarizer.anchorRange(chain(4, 1));
    const a2 = await notarizer.anchorRange(chain(4, 5));
    expect(a2.previousAnchorHash).toBe(notarizer.list()[0]!.anchorHash);
    expect(notarizer.verifyAnchorChain().ok).toBe(true);
  });

  it('proves record inclusion and verifies externally', async () => {
    const records = chain(16);
    const anchor = await notarizer.anchorRange(records);
    const proof = notarizer.prove(anchor.seq, records[9]!);
    expect(proof).toBeDefined();
    expect(notarizer.verifyInclusion(anchor, proof!)).toBe(true);
    expect(proof!.seq).toBe(10);
  });

  it('prove() returns undefined for records outside the range', async () => {
    const anchor = await notarizer.anchorRange(chain(4, 1));
    const outsider = chain(1, 99)[0]!;
    expect(notarizer.prove(anchor.seq, outsider)).toBeUndefined();
  });

  it('detects anchor-chain tampering', async () => {
    await notarizer.anchorRange(chain(3));
    const second = await notarizer.anchorRange(chain(3, 4));
    // Forge a modified copy of the second anchor.
    const forged = { ...second, merkleRoot: 'ff'.repeat(32) };
    const n2 = new Notarizer({ clock, service });
    (n2 as unknown as { anchors: unknown[] }).anchors.push(notarizer.list()[0]!, forged);
    const check = n2.verifyAnchorChain();
    expect(check.ok).toBe(false);
    expect(check.firstBadSeq).toBe(2);
  });

  it('rejects empty ranges', async () => {
    await expect(notarizer.anchorRange([])).rejects.toThrow();
  });
});

describe('SegmentCompactor', () => {
  let clock: ManualAuditClock3;
  let compactor: SegmentCompactor;

  beforeEach(() => {
    clock = new ManualAuditClock3(50_000);
    compactor = new SegmentCompactor({ clock, idGen: (() => { let i = 0; return () => `seg-${++i}`; })() });
  });

  it('compacts a verified range into a segment', () => {
    const records = chain(10);
    const report = compactor.compact(records);
    expect(report.recordsCompacted).toBe(10);
    expect(report.verified).toBe(true);
    const seg = report.segment;
    expect(seg.fromSeq).toBe(1);
    expect(seg.toSeq).toBe(10);
    expect(seg.records.length).toBe(10);
    expect(seg.records[0]!.slimHash.length).toBe(64);
    // Chain metadata dropped:
    expect((seg.records[0] as unknown as Record<string, unknown>).hash).toBeUndefined();
    expect((seg.records[0] as unknown as Record<string, unknown>).previousHash).toBeUndefined();
    expect(seg.bytesSaved).toBeGreaterThan(0);
    expect(seg.compactedAt).toBe(50_000);
  });

  it('refuses to compact an unverified (tampered) range', () => {
    const records = chain(4);
    const tampered = { ...records[1]!, actor: 'mallory' };
    expect(() => compactor.compact([records[0]!, tampered, records[2]!, records[3]!])).toThrow(
      /unverified/
    );
  });

  it('refuses non-contiguous ranges', () => {
    const records = chain(4);
    expect(() => compactor.compact([records[0]!, records[2]!])).toThrow(/non-contiguous/);
  });

  it('refuses double-compaction of the same record', () => {
    const records = chain(4);
    compactor.compact(records);
    expect(() => compactor.compact(records)).toThrow(/already compacted/);
  });

  it('verifySegment detects slim-record tampering', () => {
    const records = chain(5);
    const seg = compactor.compact(records).segment;
    expect(compactor.verifySegment(seg.id).ok).toBe(true);
    // Tamper a slim record's field inside the stored segment.
    const mutable = compactor.get(seg.id)!;
    (mutable.records as SlimMutable[])[2]!.actor = 'eve';
    expect(compactor.verifySegment(seg.id).ok).toBe(false);
  });

  it('record inclusion proofs verify against slimRoot', () => {
    const records = chain(7);
    const seg = compactor.compact(records).segment;
    const proof = compactor.proveRecord(seg.id, 4);
    expect(proof).toBeDefined();
    expect(compactor.verifyProof(seg.id, proof!)).toBe(true);
    expect(compactor.proveRecord(seg.id, 99)).toBeUndefined();
  });

  it('segmentFor maps seq → segment id', () => {
    const seg = compactor.compact(chain(3)).segment;
    expect(compactor.segmentFor(2)).toBe(seg.id);
    expect(compactor.segmentFor(9)).toBeUndefined();
  });

  it('stats aggregate across segments', () => {
    compactor.compact(chain(3, 1));
    compactor.compact(chain(3, 4));
    const s = compactor.stats();
    expect(s.segments).toBe(2);
    expect(s.records).toBe(6);
    expect(s.bytesSaved).toBeGreaterThan(0);
  });
});

interface SlimMutable {
  seq: number;
  id: string;
  actor: string;
  slimHash: string;
}

describe('AuditAlertStreamer', () => {
  let clock: ManualAuditClock3;
  let streamer: AuditAlertStreamer;
  let store: AuditStore;

  const append = (input: Partial<AuditEventInput> = {}) =>
    store.append({
      actor: 'alice',
      action: 'doc.read',
      outcome: 'success',
      severity: 'info',
      ...input,
    });

  beforeEach(() => {
    clock = new ManualAuditClock3(0);
    streamer = new AuditAlertStreamer({ clock, bufferSize: 4 });
    store = new AuditStore();
  });

  it('delivers matching records to push listeners', () => {
    const got: string[] = [];
    streamer.subscribe(
      { actions: ['doc.delete'] },
      { listener: (a) => got.push(`${a.deliverySeq}:${a.record.action}`) }
    );
    streamer.publish(append({ action: 'doc.read' }));
    streamer.publish(append({ action: 'doc.delete' }));
    streamer.publish(append({ action: 'doc.delete' }));
    expect(got).toEqual(['1:doc.delete', '2:doc.delete']);
  });

  it('buffers non-listener alerts for drain()', () => {
    const id = streamer.subscribe({ minSeverity: 'warning' });
    streamer.publish(append({ severity: 'info' }));
    streamer.publish(append({ severity: 'error' }));
    streamer.publish(append({ severity: 'critical' }));
    expect(streamer.pending(id)).toBe(2);
    const drained = streamer.drain(id);
    expect(drained.length).toBe(2);
    expect(drained[0]!.record.severity).toBe('error');
    expect(streamer.pending(id)).toBe(0);
    expect(streamer.subscription(id)!.delivered).toBe(2);
  });

  it('drops overflow instead of blocking', () => {
    const id = streamer.subscribe({}); // match everything
    for (let i = 0; i < 10; i++) streamer.publish(append());
    expect(streamer.pending(id)).toBe(4);
    expect(streamer.subscription(id)!.dropped).toBe(6);
  });

  it('compound filters AND all conditions', () => {
    const matcher = compileFilter({
      tenant: 'acme',
      actionPrefix: 'admin.',
      outcomes: ['failure', 'denied'],
      minSeverity: 'notice',
    });
    const match = append({
      tenant: 'acme',
      action: 'admin.user.delete',
      outcome: 'denied',
      severity: 'warning',
    });
    expect(matcher(match)).toBe(true);
    expect(matcher(append({ tenant: 'other', action: 'admin.user.delete', outcome: 'denied', severity: 'warning' }))).toBe(false);
    expect(matcher(append({ tenant: 'acme', action: 'admin.x', outcome: 'success', severity: 'warning' }))).toBe(false);
    expect(matcher(append({ tenant: 'acme', action: 'admin.x', outcome: 'denied', severity: 'debug' }))).toBe(false);
  });

  it('actor/action set membership', () => {
    const got: number[] = [];
    streamer.subscribe(
      { actors: ['bob', 'carol'], actions: ['vault.open'] },
      { listener: (a) => got.push(a.record.seq) }
    );
    streamer.publish(append({ actor: 'alice', action: 'vault.open' }));
    streamer.publish(append({ actor: 'bob', action: 'vault.open' }));
    streamer.publish(append({ actor: 'bob', action: 'vault.close' }));
    expect(got).toEqual([2]);
  });

  it('publish returns match count; stats aggregate', () => {
    streamer.subscribe({ minSeverity: 'error' });
    streamer.subscribe({ actions: ['doc.read'] });
    const matches = streamer.publish(append({ severity: 'error', action: 'doc.read' }));
    expect(matches).toBe(2);
    expect(streamer.stats().matched).toBe(2);
    expect(streamer.stats().published).toBe(1);
  });

  it('unsubscribe stops delivery', () => {
    const got: number[] = [];
    const id = streamer.subscribe({}, { listener: (a) => got.push(a.record.seq) });
    streamer.publish(append());
    streamer.unsubscribe(id);
    streamer.publish(append());
    expect(got).toEqual([1]);
  });

  it('setListener attaches post-hoc push delivery', () => {
    const id = streamer.subscribe({});
    streamer.publish(append());
    const got: number[] = [];
    streamer.setListener(id, (a) => got.push(a.record.seq));
    streamer.publish(append());
    // Buffered alert stays for drain; new alert pushes.
    expect(got).toEqual([2]);
    expect(streamer.pending(id)).toBe(1);
  });
});

describe('ComplianceExportScheduler', () => {
  let clock: ManualAuditClock3;
  let store: AuditStore;
  let scheduler: ComplianceExportScheduler;

  beforeEach(() => {
    clock = new ManualAuditClock3(0);
    store = new AuditStore();
    scheduler = new ComplianceExportScheduler(
      (q) => store.query({ actor: q.subjectId, tenant: q.tenant }).records,
      { clock, slaMs: 1_000_000, warningMs: 100_000 }
    );
    store.append({ actor: 'alice', action: 'doc.read', resource: 'doc:1' });
    store.append({ actor: 'alice', action: 'doc.write', resource: 'doc:1' });
    store.append({ actor: 'bob', action: 'doc.read', resource: 'doc:2' });
  });

  it('runs the full lifecycle pending → processing → ready → delivered', () => {
    const req = scheduler.submit('alice');
    expect(req.status).toBe('pending');
    scheduler.startProcessing(req.id);
    const bundle = scheduler.assemble(req.id);
    expect(bundle.records.length).toBe(2);
    expect(bundle.records.every((r) => r.actor === 'alice')).toBe(true);
    expect(scheduler.get(req.id)!.status).toBe('ready');
    scheduler.deliver(req.id);
    const done = scheduler.get(req.id)!;
    expect(done.status).toBe('delivered');
    expect(done.history.map((h) => h.to)).toEqual([
      'pending',
      'processing',
      'ready',
      'delivered',
    ]);
  });

  it('assemble() auto-transitions pending → processing', () => {
    const req = scheduler.submit('alice');
    scheduler.assemble(req.id);
    expect(scheduler.get(req.id)!.status).toBe('ready');
  });

  it('bundle checksum verifies', () => {
    const req = scheduler.submit('alice');
    scheduler.assemble(req.id);
    expect(scheduler.verifyBundle(req.id)).toBe(true);
  });

  it('tenant scoping limits exported records', () => {
    store.append({ actor: 'carol', action: 'x', tenant: 'eu' });
    store.append({ actor: 'carol', action: 'y', tenant: 'us' });
    const req = scheduler.submit('carol', { tenant: 'eu' });
    const bundle = scheduler.assemble(req.id);
    expect(bundle.records.length).toBe(1);
    expect(bundle.records[0]!.tenant).toBe('eu');
  });

  it('tick() expires requests past SLA', () => {
    const req = scheduler.submit('alice');
    clock.advance(1_000_001);
    const expired = scheduler.tick();
    expect(expired).toEqual([req.id]);
    expect(scheduler.get(req.id)!.status).toBe('expired');
  });

  it('slaReport counts statuses and flags at-risk', () => {
    const a = scheduler.submit('alice');
    scheduler.submit('bob');
    scheduler.assemble(a.id);
    clock.advance(950_000); // alice's second request... only bob's is at risk
    const report = scheduler.slaReport();
    expect(report.ready).toBe(1);
    expect(report.pending).toBe(1);
    expect(report.atRisk.length).toBe(1);
  });

  it('rejects invalid transitions', () => {
    const req = scheduler.submit('alice');
    expect(() => scheduler.deliver(req.id)).toThrow(/invalid transition/);
    scheduler.assemble(req.id);
    scheduler.deliver(req.id);
    expect(() => scheduler.cancel(req.id)).toThrow(/invalid transition/);
  });

  it('cancel works from pending and processing', () => {
    const req = scheduler.submit('alice');
    scheduler.cancel(req.id, 'withdrawn');
    expect(scheduler.get(req.id)!.status).toBe('cancelled');
    const req2 = scheduler.submit('alice');
    scheduler.startProcessing(req2.id);
    scheduler.cancel(req2.id);
    expect(scheduler.get(req2.id)!.status).toBe('cancelled');
  });

  it('assembling after SLA expiry fails and expires the request', () => {
    const req = scheduler.submit('alice');
    scheduler.startProcessing(req.id);
    clock.advance(1_000_001);
    expect(() => scheduler.assemble(req.id)).toThrow(/expired/);
    expect(scheduler.get(req.id)!.status).toBe('expired');
  });
});
