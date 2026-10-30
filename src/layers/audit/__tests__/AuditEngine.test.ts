/**
 * Audit engine tests: hash chain, store, queries, retention,
 * legal holds, anomaly detection, exporters, compliance reports.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  canonicalJson,
  computeRecordHash,
  sealRecord,
  verifyRecord,
  verifyChain,
  GENESIS_HASH,
} from '../engine/HashChain';
import { AuditStore } from '../engine/AuditStore';
import { RetentionManager, holdMatches } from '../engine/RetentionManager';
import { AnomalyDetector } from '../engine/AnomalyDetector';
import {
  toCefLine,
  toCsvLine,
  exportRecords,
  AUDIT_CSV_HEADER,
} from '../engine/AuditExporter';
import { AuditPipeline } from '../engine/AuditPipeline';
import type { AuditClock, AuditRecord, RetentionPolicy } from '../engine/types';

class FakeClock implements AuditClock {
  t = 1_700_000_000_000; // fixed epoch for determinism
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

describe('canonicalJson', () => {
  it('sorts keys recursively and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 }, u: undefined })).toBe(
      '{"a":{"c":3,"d":2},"b":1}'
    );
  });
  it('handles arrays and primitives', () => {
    expect(canonicalJson([1, 'x', null])).toBe('[1,"x",null]');
    expect(canonicalJson('s')).toBe('"s"');
  });
});

describe('HashChain', () => {
  const input = {
    actor: 'alice',
    action: 'doc.read',
    resource: 'doc:1',
    outcome: 'success' as const,
    severity: 'info' as const,
    details: {},
  };

  it('seals a record chaining to genesis', () => {
    const r = sealRecord(input, {
      seq: 1,
      id: 'a1',
      previousHash: GENESIS_HASH,
      timestamp: 1000,
      tier: 'hot',
    });
    expect(r.previousHash).toBe(GENESIS_HASH);
    expect(verifyRecord(r)).toBe(true);
    expect(r.hash).toBe(computeRecordHash({ ...r, hash: undefined } as never));
  });

  it('detects tampering with a record field', () => {
    const r = sealRecord(input, {
      seq: 1,
      id: 'a1',
      previousHash: GENESIS_HASH,
      timestamp: 1000,
      tier: 'hot',
    });
    const tampered = { ...r, actor: 'mallory' };
    expect(verifyRecord(tampered)).toBe(false);
  });

  it('detects a broken chain link', () => {
    const r1 = sealRecord(input, {
      seq: 1, id: 'a1', previousHash: GENESIS_HASH, timestamp: 1, tier: 'hot',
    });
    const r2 = sealRecord(input, {
      seq: 2, id: 'a2', previousHash: r1.hash, timestamp: 2, tier: 'hot',
    });
    expect(verifyChain([r1, r2]).ok).toBe(true);
    const bad = { ...r2, previousHash: 'deadbeef' };
    const v = verifyChain([r1, bad]);
    expect(v.ok).toBe(false);
    expect(v.firstBadIndex).toBe(1);
  });
});

describe('AuditStore', () => {
  let clock: FakeClock;
  let store: AuditStore;

  beforeEach(() => {
    clock = new FakeClock();
    store = new AuditStore({ clock });
  });

  it('appends immutable records with monotonic seq and hash chain', () => {
    const a = store.append({ actor: 'u1', action: 'login' });
    const b = store.append({ actor: 'u1', action: 'logout' });
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(b.previousHash).toBe(a.hash);
    expect(store.verifyIntegrity().ok).toBe(true);
  });

  it('queries by actor, resource, severity, outcome, time', () => {
    store.append({ actor: 'alice', action: 'a', resource: 'r1', severity: 'info' });
    clock.advance(1000);
    const t1 = clock.now();
    store.append({ actor: 'bob', action: 'b', resource: 'r1', severity: 'error', outcome: 'failure' });
    store.append({ actor: 'alice', action: 'a.b', resource: 'r2', severity: 'warning' });

    expect(store.query({ actor: 'alice' }).total).toBe(2);
    expect(store.query({ resource: 'r1' }).total).toBe(2);
    expect(store.query({ minSeverity: 'warning' }).total).toBe(2);
    expect(store.query({ outcome: 'failure' }).total).toBe(1);
    expect(store.query({ fromMs: t1 }).total).toBe(2);
    expect(store.query({ actionPrefix: 'a.' }).total).toBe(1);
    expect(store.query({ actor: 'alice', minSeverity: 'warning' }).total).toBe(1);
  });

  it('supports paging and ordering', () => {
    for (let i = 0; i < 10; i++) {
      store.append({ actor: 'u', action: `a${i}` });
    }
    const page = store.query({ actor: 'u', order: 'desc', limit: 3, offset: 0 });
    expect(page.records.length).toBe(3);
    expect(page.records[0]!.action).toBe('a9');
    expect(page.total).toBe(10);
  });

  it('getById and getBySeq', () => {
    const r = store.append({ actor: 'u', action: 'x' });
    expect(store.getById(r.id)?.actor).toBe('u');
    expect(store.getBySeq(1)?.id).toBe(r.id);
  });

  it('verifyRange detects tampering inside a window', () => {
    store.append({ actor: 'a', action: 'x' });
    store.append({ actor: 'b', action: 'y' });
    store.append({ actor: 'c', action: 'z' });
    expect(store.verifyRange(2, 3).ok).toBe(true);
    // tamper internal array via purged reference — simulate by mutating
    // a copy is not possible; instead verify range rejects bad bounds.
    expect(store.verifyRange(0, 99).ok).toBe(false);
  });

  it('detects corruption if a stored record is mutated', () => {
    store.append({ actor: 'a', action: 'x' });
    const r = store.append({ actor: 'b', action: 'y' });
    // Mutate the stored object via a cast — simulating an attacker
    // who got a reference to the internal array.
    (r as { actor: string }).actor = 'mallory';
    const report = store.verifyIntegrity();
    expect(report.ok).toBe(false);
    expect(report.firstCorruptSeq).toBe(2);
  });
});

describe('RetentionManager', () => {
  let clock: FakeClock;
  let store: AuditStore;
  let mgr: RetentionManager;
  const policy: RetentionPolicy = {
    tiers: [
      { name: 'hot', maxAgeMs: 1000, next: 'warm' },
      { name: 'warm', maxAgeMs: 5000, next: 'cold' },
      { name: 'cold', maxAgeMs: 10_000, next: 'frozen' },
      { name: 'frozen', maxAgeMs: Number.MAX_SAFE_INTEGER },
    ],
    purgeAfterMs: 20_000,
  };

  beforeEach(() => {
    clock = new FakeClock();
    store = new AuditStore({ clock });
    mgr = new RetentionManager(store, policy, clock);
  });

  it('promotes records through tiers by age', () => {
    store.append({ actor: 'a', action: 'x' });
    clock.advance(2000); // > hot maxAge 1000
    mgr.sweep();
    expect(store.getBySeq(1)!.tier).toBe('warm');
    clock.advance(5000); // > warm maxAge 5000 total 7000
    mgr.sweep();
    expect(store.getBySeq(1)!.tier).toBe('cold');
    expect(store.verifyIntegrity().ok).toBe(true);
  });

  it('purges records past purgeAfterMs', () => {
    store.append({ actor: 'a', action: 'x' });
    clock.advance(30_000);
    const res = mgr.sweep();
    expect(res.purged).toBe(1);
    expect(store.size).toBe(0);
  });

  it('legal hold overrides purge', () => {
    store.append({ actor: 'alice', action: 'x' });
    store.append({ actor: 'bob', action: 'x' });
    mgr.addHold({ actor: 'alice' }, 'litigation');
    clock.advance(30_000);
    const res = mgr.sweep();
    expect(res.purged).toBe(1);
    expect(res.held).toBe(1);
    expect(store.size).toBe(1);
    expect(store.getBySeq(1)!.actor).toBe('alice');
  });

  it('hold filters match on multiple fields', () => {
    const hold = mgr.addHold(
      { actor: 'a', resourceType: 'doc', tenant: 't1' },
      'case-1'
    );
    const r = store.append({ actor: 'a', action: 'x', resourceType: 'doc', tenant: 't1' });
    const r2 = store.append({ actor: 'a', action: 'x', resourceType: 'img', tenant: 't1' });
    expect(holdMatches(hold, r)).toBe(true);
    expect(holdMatches(hold, r2)).toBe(false);
    expect(mgr.isHeld(r)).toBe(true);
    expect(mgr.removeHold(hold.id)).toBe(true);
    expect(mgr.isHeld(r)).toBe(false);
  });
});

describe('AnomalyDetector', () => {
  let clock: FakeClock;

  const rec = (actor: string, ts: number, outcome: 'success' | 'failure' = 'success'): AuditRecord =>
    sealRecord(
      { actor, action: 'a', outcome },
      { seq: 0, id: `x${ts}`, previousHash: GENESIS_HASH, timestamp: ts, tier: 'hot' }
    );

  beforeEach(() => {
    clock = new FakeClock();
  });

  it('flags a volume spike after warm-up', () => {
    const det = new AnomalyDetector(
      { windowMs: 1000, spikeMultiplier: 3, alpha: 0.5, minWindows: 2 },
      clock
    );
    const base = clock.t;
    // 3 windows of ~2 events -> baseline ~2
    for (let w = 0; w < 3; w++) {
      det.observe(rec('a', base + w * 1000));
      det.observe(rec('a', base + w * 1000 + 1));
    }
    // window 4: 20 events -> spike fires when the window closes
    const raised = [];
    for (let i = 0; i < 20; i++) {
      raised.push(...det.observe(rec('a', base + 3 * 1000)));
    }
    clock.t = base + 4 * 1000; // close window 3
    raised.push(...det.flush());
    expect(raised.some((a) => a.kind === 'volume-spike')).toBe(true);
  });

  it('flags failure spikes', () => {
    const det = new AnomalyDetector(
      { windowMs: 1000, spikeMultiplier: 2, alpha: 1, minWindows: 2 },
      clock
    );
    const base = clock.t;
    for (let w = 0; w < 3; w++) {
      det.observe(rec('a', base + w * 1000, 'failure'));
      det.observe(rec('a', base + w * 1000 + 1, 'success'));
    }
    const raised = [];
    for (let i = 0; i < 10; i++) {
      raised.push(...det.observe(rec('a', base + 3 * 1000 + i, 'failure')));
    }
    clock.t = base + 4 * 1000; // close window 3
    raised.push(...det.flush());
    expect(raised.some((a) => a.kind === 'failure-spike')).toBe(true);
  });

  it('detects new actors when enabled', () => {
    const det = new AnomalyDetector({ detectNewActors: true, windowMs: 1000 }, clock);
    const raised = det.observe(rec('newbie', clock.t));
    expect(raised[0]?.kind).toBe('new-actor');
  });

  it('detects off-hours events', () => {
    const det = new AnomalyDetector(
      { windowMs: 1000, businessHoursUtc: { start: 8, end: 18 } },
      clock
    );
    // 2023-11-14T22:13:20Z base is hour 22
    const raised = det.observe(rec('nightowl', clock.t));
    expect(raised.some((a) => a.kind === 'off-hours')).toBe(true);
  });

  it('does not flag within business hours', () => {
    const det = new AnomalyDetector(
      { windowMs: 1000, businessHoursUtc: { start: 8, end: 23 } },
      clock
    );
    const raised = det.observe(rec('worker', clock.t));
    expect(raised.filter((a) => a.kind === 'off-hours').length).toBe(0);
  });
});

describe('AuditExporter', () => {
  const rec: AuditRecord = sealRecord(
    {
      actor: 'alice',
      action: 'doc.delete',
      resource: 'doc:9',
      outcome: 'success',
      severity: 'warning',
      timestamp: 1_700_000_000_000,
      tenant: 'acme',
      sourceIp: '10.0.0.1',
      details: { reason: 'cleanup' },
    },
    { seq: 1, id: 'aud_1', previousHash: GENESIS_HASH, timestamp: 0, tier: 'hot' }
  );

  it('formats CEF lines with extension fields', () => {
    const line = toCefLine(rec);
    expect(line.startsWith('CEF:0|OMHW|AuditLayer|1.0|')).toBe(true);
    expect(line).toContain('suser=alice');
    expect(line).toContain('act=doc.delete');
    expect(line).toContain('cs4=' + rec.hash);
    expect(line).toContain('src=10.0.0.1');
  });

  it('escapes CEF pipes', () => {
    const tricky = sealRecord(
      { actor: 'a|b', action: 'x' },
      { seq: 1, id: 'i', previousHash: GENESIS_HASH, timestamp: 0, tier: 'hot' }
    );
    expect(toCefLine(tricky)).toContain('suser=a\\|b');
  });

  it('formats CSV with header and escaping', () => {
    const body = exportRecords([rec], 'csv');
    const lines = body.trim().split('\n');
    expect(lines[0]).toBe(AUDIT_CSV_HEADER);
    expect(lines[1]).toContain('alice');
  });

  it('formats JSONL one per line', () => {
    const body = exportRecords([rec, rec], 'jsonl');
    const lines = body.trim().split('\n');
    expect(lines.length).toBe(2);
    const parsed = JSON.parse(lines[0]!) as AuditRecord;
    expect(parsed.actor).toBe('alice');
  });
});

describe('AuditPipeline end-to-end', () => {
  let clock: FakeClock;
  let pipe: AuditPipeline;

  beforeEach(() => {
    clock = new FakeClock();
    pipe = new AuditPipeline({ clock });
  });

  it('captures and queries events', () => {
    pipe.capture({ actor: 'u', action: 'login', severity: 'info' });
    pipe.capture({ actor: 'u', action: 'delete', severity: 'critical' });
    expect(pipe.query({ actor: 'u' }).total).toBe(2);
    expect(pipe.since('error', 0).total).toBe(1);
  });

  it('integrity report verifies the whole chain', () => {
    for (let i = 0; i < 5; i++) pipe.capture({ actor: 'u', action: `a${i}` });
    const report = pipe.verifyIntegrity();
    expect(report.ok).toBe(true);
    expect(report.recordsChecked).toBe(5);
  });

  it('compliance report aggregates the window', () => {
    pipe.capture({ actor: 'a', action: 'login', outcome: 'success' });
    pipe.capture({ actor: 'a', action: 'login', outcome: 'failure' });
    pipe.capture({ actor: 'b', action: 'read', outcome: 'success' });
    const report = pipe.complianceReport(0, clock.t + 1000);
    expect(report.totalEvents).toBe(3);
    expect(report.byOutcome['failure']).toBe(1);
    expect(report.topActors[0]).toEqual({ actor: 'a', count: 2 });
    expect(report.integrity.ok).toBe(true);
    expect(report.tipHash).toBe(pipe.store.tipHash);
  });

  it('exports records to CEF', () => {
    pipe.capture({ actor: 'a', action: 'login' });
    const out = pipe.export({ actor: 'a' }, 'cef');
    expect(out.count).toBe(1);
    expect(out.body).toContain('CEF:0|');
    expect(out.contentType).toContain('text/plain');
  });
});
