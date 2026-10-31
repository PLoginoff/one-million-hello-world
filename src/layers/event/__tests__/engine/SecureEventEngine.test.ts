/**
 * Event Security Engine tests
 *
 * Covers: AES-256-GCM envelope encryption with per-stream DEKs and key
 * rotation, structural delta compression (diff/apply round-trips),
 * cold-storage archival with read-through resolution, write-time schema
 * validation, and cross-bus replication with lag tracking.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { randomBytes } from 'node:crypto';

import {
  ArchiveStore,
  BusReplicator,
  DeltaCompressor,
  EventDecryptionError,
  EventRetention,
  EventSchemaError,
  EventThrottler,
  FrameError,
  SecureEventEngine,
  StreamCipher,
  WriteSchemaValidator,
  applyDiff,
  jsonDiff,
} from '../../engine/security';
import { EventLog } from '../../engine/EventLog';
import type { EngineEvent } from '../../engine/types';

let now: number;
const clock = () => now;

beforeEach(() => {
  now = 1_000_000;
});

const ev = (type: string, data: unknown, over: Partial<EngineEvent> = {}): EngineEvent => ({
  streamId: 's',
  type,
  data,
  ...over,
});

// --------------------------------------------------------------------------

describe('StreamCipher — AES-256-GCM envelope encryption', () => {
  it('encrypts and decrypts a payload round-trip', () => {
    const c = new StreamCipher({ kek: randomBytes(32) });
    const payload = { amount: 100, currency: 'USD' };
    const env = c.encrypt('orders', payload);
    expect(env.ciphertext).not.toContain('amount');
    expect(env.keyVersion).toBe(1);
    const out = c.decrypt<typeof payload>('orders', env);
    expect(out).toEqual(payload);
  });

  it('uses a unique IV per encryption (nonce never repeats)', () => {
    const c = new StreamCipher({ kek: randomBytes(32) });
    const a = c.encrypt('s', { x: 1 });
    const b = c.encrypt('s', { x: 1 });
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext); // same plaintext, different IV
  });

  it('detects tampering via the GCM auth tag', () => {
    const c = new StreamCipher({ kek: randomBytes(32) });
    const env = c.encrypt('s', { secret: true });
    const bad = { ...env, ciphertext: env.ciphertext.slice(0, -4) + 'AAAA' };
    expect(() => c.decrypt('s', bad)).toThrow(EventDecryptionError);
  });

  it('per-stream keys isolate streams', () => {
    const c = new StreamCipher({ kek: randomBytes(32) });
    const env = c.encrypt('a', { v: 1 });
    // Stream b has no keys → can't decrypt a's envelope.
    expect(() => c.decrypt('b', env)).toThrow(EventDecryptionError);
  });

  it('key rotation keeps old events decryptable, new events use new version', () => {
    const c = new StreamCipher({ kek: randomBytes(32) });
    const e1 = c.encrypt('s', { n: 1 });
    const v2 = c.rotateStreamKey('s');
    const e2 = c.encrypt('s', { n: 2 });
    expect(e2.keyVersion).toBe(v2);
    expect(c.decrypt<{ n: number }>('s', e1).n).toBe(1); // old key still works
    expect(c.decrypt<{ n: number }>('s', e2).n).toBe(2);
  });

  it('retiring a key version crypto-shreds its events', () => {
    const c = new StreamCipher({ kek: randomBytes(32) });
    const e1 = c.encrypt('s', { n: 1 });
    c.rotateStreamKey('s');
    expect(c.retireKeyVersion('s', 1)).toBe(true);
    expect(() => c.decrypt('s', e1)).toThrow(EventDecryptionError);
  });
});

// --------------------------------------------------------------------------

describe('DeltaCompressor — structural diff encoding', () => {
  it('diff/apply round-trips a nested object', () => {
    const a = { user: { name: 'al', age: 30 }, items: [1, 2, 3], flag: true };
    const b = { user: { name: 'al', age: 31 }, items: [1, 2, 4], flag: false, extra: 'x' };
    const d = jsonDiff(a, b);
    expect(d).toBeDefined();
    const out = applyDiff(a, d as NonNullable<typeof d>);
    expect(out).toEqual(b);
  });

  it('returns undefined for identical values', () => {
    expect(jsonDiff({ a: 1 }, { a: 1 })).toBeUndefined();
  });

  it('handles type changes as wholesale replace', () => {
    const d = jsonDiff({ a: 1 }, 'string');
    expect(applyDiff({ a: 1 }, d as NonNullable<typeof d>)).toBe('string');
  });

  it('diffs arrays elementwise with length deltas', () => {
    const a = [1, 2, 3];
    const b = [1, 9, 3, 4];
    const d = jsonDiff(a, b);
    expect(applyDiff(a, d as NonNullable<typeof d>)).toEqual(b);
    // Shrink case.
    const d2 = jsonDiff(b, a);
    expect(applyDiff(b, d2 as NonNullable<typeof d2>)).toEqual(a);
  });

  it('compresses similar events to small delta frames', () => {
    const c = new DeltaCompressor({ keyEvery: 10 });
    const base = { order: 'o1', status: 'pending', total: 100, items: ['a', 'b'] };
    const r1 = c.encode('orders', base);
    expect(r1.frame.kind).toBe('key');
    // Nearly-identical next event → delta, much smaller than full.
    const r2 = c.encode('orders', { ...base, status: 'shipped' });
    expect(r2.frame.kind).toBe('delta');
    expect(r2.ratio).toBeLessThan(0.7);
    // Round-trip.
    expect(c.decode('orders', r2.frame)).toEqual({ ...base, status: 'shipped' });
  });

  it('forces a key frame every keyEvery events', () => {
    const c = new DeltaCompressor({ keyEvery: 3 });
    // Payload big enough that a small diff clearly beats deltaRatio.
    const big = { data: 'x'.repeat(200), seq: 0 };
    c.encode('s', big); // key
    const d1 = c.encode('s', { ...big, seq: 1 }); // delta (1d)
    const d2 = c.encode('s', { ...big, seq: 2 }); // delta (2d) — at limit
    const r = c.encode('s', { ...big, seq: 3 }); // over limit → key
    expect(d1.frame.kind).toBe('delta');
    expect(d2.frame.kind).toBe('delta');
    expect(r.frame.kind).toBe('key');
  });

  it('decode throws FrameError on unknown base', () => {
    const c = new DeltaCompressor();
    const big = { data: 'y'.repeat(200), n: 1 };
    c.encode('s', big);
    const r = c.encode('s', { ...big, n: 2 });
    expect(r.frame.kind).toBe('delta');
    // A resolver that can't find the base → delta is undecodable.
    expect(() => c.decode('s', { ...r.frame, baseId: 'missing' })).toThrow(FrameError);
    // decodeAll resolves bases by frame id in order.
    const decoded = c.decodeAll([
      { kind: 'key', full: JSON.stringify(big), sizeBytes: 210, id: 'f0' },
      { ...r.frame, id: 'f1' },
    ]);
    expect(decoded[1]).toEqual({ ...big, n: 2 });
  });
});

// --------------------------------------------------------------------------

describe('ArchiveStore — cold-storage tier', () => {
  it('archives events older than retention, resolves them read-through', () => {
    const log = new EventLog({ clock });
    now = 1_000;
    log.append('s', [ev('E', { n: 1 }), ev('E', { n: 2 })]);
    now = 5_000;
    log.append('s', [ev('E', { n: 3 })]);

    const archive = new ArchiveStore({ clock });
    now = 10_000;
    const moved = archive.archiveEligible(log, 6_000); // cutoff = 4000
    expect(moved).toEqual([0, 1]); // first two events aged out
    expect(archive.size).toBe(2);

    // Read-through: position 0 is in archive, position 2 in hot log.
    const cold = archive.resolve(log, 0);
    expect((cold?.data as { n: number }).n).toBe(1);
    const hot = archive.resolve(log, 2);
    expect((hot?.data as { n: number }).n).toBe(3);
  });

  it('stops scanning at the first ineligible event (log is time-ordered)', () => {
    const log = new EventLog({ clock });
    now = 1_000;
    log.append('s', [ev('E', { n: 1 })]);
    now = 100;
    const archive = new ArchiveStore({ clock });
    const moved = archive.archiveEligible(log, 10_000);
    expect(moved).toEqual([]);
  });
});

// --------------------------------------------------------------------------

describe('WriteSchemaValidator — schema on write', () => {
  it('rejects an event missing a required field', () => {
    const v = new WriteSchemaValidator();
    v.register({
      eventType: 'OrderCreated',
      fields: { orderId: 'string', total: 'number' },
      required: ['orderId'],
    });
    const bad = v.validate(ev('OrderCreated', { total: 5 }));
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toContain('orderId');
  });

  it('rejects wrong field types and too-new schema versions', () => {
    const v = new WriteSchemaValidator();
    v.register({
      eventType: 'E',
      fields: { n: 'number' },
      maxVersion: 2,
    });
    expect(v.validate(ev('E', { n: 'x' })).ok).toBe(false);
    expect(v.validate(ev('E', { n: 1 }, { schemaVersion: 3 })).ok).toBe(false);
    expect(v.validate(ev('E', { n: 1 }, { schemaVersion: 2 })).ok).toBe(true);
  });

  it('unregistered types pass through (opt-in governance)', () => {
    const v = new WriteSchemaValidator();
    expect(v.validate(ev('Anything', { junk: true })).ok).toBe(true);
  });

  it('assertValid throws EventSchemaError with all violations', () => {
    const v = new WriteSchemaValidator();
    v.register({ eventType: 'E', fields: { a: 'string' }, required: ['a', 'b'] });
    expect(() => v.assertValid(ev('E', {}))).toThrow(EventSchemaError);
  });
});

// --------------------------------------------------------------------------

describe('BusReplicator — cross-bus replication', () => {
  it('replicates new events to a target log, tracking lag', () => {
    const src = new EventLog({ clock });
    const dst = new EventLog({ clock });
    src.append('s', [ev('E', { n: 1 }), ev('E', { n: 2 })]);
    const rep = new BusReplicator(src, dst);
    expect(rep.replicate()).toBe(2);
    expect(dst.length).toBe(2);
    expect(rep.status().lag).toBe(0);

    // Replica preserves payload, remaps positions, links provenance.
    const copy = dst.readFrom(0)[0];
    expect(copy.meta.replicationOf).toBe(src.readFrom(0)[0].id);
    expect(copy.meta.sourceGlobalPosition).toBe(0);

    // Incremental replication picks up only new events.
    src.append('s', [ev('E', { n: 3 })]);
    expect(rep.replicate()).toBe(1);
    expect(rep.status().lag).toBe(0);
  });

  it('respects a filter for selective replication', () => {
    const src = new EventLog({ clock });
    const dst = new EventLog({ clock });
    src.append('keep', [ev('E', { n: 1 })]);
    src.append('drop', [ev('E', { n: 2 })]);
    const rep = new BusReplicator(src, dst, { filter: (e) => e.streamId === 'keep' });
    rep.replicate();
    expect(dst.length).toBe(1);
    expect(dst.readFrom(0)[0].streamId).toBe('keep');
  });
});

// --------------------------------------------------------------------------

describe('EventThrottler — write-side rate limiting', () => {
  it('allows bursts up to capacity then enforces sustained rate', () => {
    const t = new EventThrottler({ ratePerSec: 10, capacity: 5, clock });
    // 5 burst tokens available instantly.
    for (let i = 0; i < 5; i++) expect(t.consume().allowed).toBe(true);
    expect(t.consume().allowed).toBe(false); // bucket empty
    expect(t.consume().reason).toBe('rate');
  });

  it('refills tokens over time', () => {
    const t = new EventThrottler({ ratePerSec: 100, capacity: 10, clock });
    for (let i = 0; i < 10; i++) t.consume();
    expect(t.availableTokens).toBeLessThan(1);
    now += 100; // 100ms × 100/s = 10 tokens
    expect(t.availableTokens).toBe(10);
  });

  it('reports retryAfterMs scaled to the deficit', () => {
    const t = new EventThrottler({ ratePerSec: 10, capacity: 1, clock });
    t.consume(); // empty
    const d = t.consume(3);
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBeGreaterThan(0);
    expect(d.retryAfterMs).toBeLessThanOrEqual(400);
  });

  it('hard-caps emits per sliding window regardless of token balance', () => {
    const t = new EventThrottler({
      ratePerSec: 1e9, // effectively infinite rate
      capacity: 1e9,
      maxPerWindow: 3,
      windowMs: 1000,
      clock,
    });
    expect(t.consume().allowed).toBe(true);
    expect(t.consume().allowed).toBe(true);
    expect(t.consume().allowed).toBe(true);
    const d = t.consume();
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('window');
    // Window slides forward → capacity returns.
    now += 1100;
    expect(t.consume().allowed).toBe(true);
  });

  it('through() throws with THROTTLED code when rejected', () => {
    const t = new EventThrottler({ ratePerSec: 0, capacity: 0, clock });
    expect(() => t.through(1, () => 'x')).toThrow();
  });
});

// --------------------------------------------------------------------------

describe('EventRetention — retention + compaction', () => {
  const mkEv = (pos: number, at: number, data: unknown): import('../../engine/types').StoredEngineEvent => ({
    id: `e${pos}`,
    streamId: 's',
    streamPosition: pos,
    globalPosition: pos,
    type: 'E',
    schemaVersion: 1,
    data,
    meta: {},
    committedAt: at,
  });

  it('maxAge marks old events eligible', () => {
    const ret = new EventRetention({ clock });
    // now = 1_000_000; committedAt 100/500 are way older than 600ms ago.
    const events = [mkEv(0, 100, {}), mkEv(1, 500, {}), mkEv(2, 999_999_900, {})];
    const ev = ret.evaluate('s', events, { name: 'age', maxAgeMs: 600 });
    // Only pos 2 (committedAt 999999900) is within the last 600ms.
    expect(ev.eligiblePositions).toEqual([0, 1]);
    expect(ev.retained.length).toBe(1);
  });

  it('maxCount keeps the newest N', () => {
    const ret = new EventRetention({ clock });
    const events = [mkEv(0, 1, {}), mkEv(1, 2, {}), mkEv(2, 3, {}), mkEv(3, 4, {})];
    const ev = ret.evaluate('s', events, { name: 'count', maxCount: 2 });
    expect(ev.retained.map((e) => e.globalPosition)).toEqual([2, 3]);
  });

  it('compaction keeps only latest per key field', () => {
    const ret = new EventRetention({ clock });
    const events = [
      mkEv(0, 1, { userId: 'u1', v: 1 }),
      mkEv(1, 2, { userId: 'u2', v: 1 }),
      mkEv(2, 3, { userId: 'u1', v: 2 }), // supersedes pos 0
      mkEv(3, 4, { userId: 'u3', v: 1 }),
    ];
    const ev = ret.evaluate('s', events, { name: 'compact', compactKeyField: 'userId' });
    expect(ev.retained.map((e) => e.globalPosition)).toEqual([1, 2, 3]);
  });

  it('policies compose by union', () => {
    const ret = new EventRetention({ clock });
    const events = [mkEv(0, 1, { k: 'a' }), mkEv(1, 2, { k: 'b' }), mkEv(2, 3, { k: 'b' })];
    const ev = ret.evaluate('s', events, {
      name: 'both',
      maxCount: 2,
      compactKeyField: 'k',
    });
    // maxCount drops pos 0; compaction drops pos 1 (superseded by pos 2).
    expect(ev.retained.map((e) => e.globalPosition)).toEqual([2]);
  });
});

// --------------------------------------------------------------------------

describe('SecureEventEngine — encrypted+compressed pipeline', () => {
  it('emits encrypted events and reads them back transparently', () => {
    const eng = new SecureEventEngine({ clock, encryption: true, compression: true });
    eng.schemas.register({
      eventType: 'OrderCreated',
      fields: { orderId: 'string' },
      required: ['orderId'],
    });
    const payload = { orderId: 'o1', total: 42, items: ['a'] };
    eng.emit('orders', [ev('OrderCreated', payload)]);

    // At rest: data is an encrypted envelope — no plaintext fields visible.
    const stored = eng.log.readStream('orders')[0];
    expect(JSON.stringify(stored.data)).not.toContain('orderId');
    expect(JSON.stringify(stored.data)).not.toContain('total');

    // Read path decrypts+decompresses transparently.
    const read = eng.readStream('orders')[0];
    expect(read.data).toEqual(payload);
  });

  it('schema validation rejects bad writes before commit', () => {
    const eng = new SecureEventEngine({ clock });
    eng.schemas.register({
      eventType: 'E',
      fields: { a: 'string' },
      required: ['a'],
    });
    expect(() => eng.emit('s', [ev('E', {})])).toThrow(EventSchemaError);
    expect(eng.log.length).toBe(0); // rejected BEFORE append
  });
});
