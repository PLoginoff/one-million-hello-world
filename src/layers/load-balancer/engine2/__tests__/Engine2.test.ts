/**
 * Tests for RequestQueue, SessionPersistence, BackendMetrics, ResilientPool.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RequestQueue } from '../RequestQueue';
import { SessionPersistence } from '../SessionPersistence';
import { BackendMetrics } from '../BackendMetrics';
import { ResilientPool } from '../ResilientPool';
import { ManualLbClock2, Backend2 } from '../types';

const bk = (id: string, w = 10): Backend2 => ({ id, baseWeight: w });

describe('RequestQueue', () => {
  let clock: ManualLbClock2;
  let q: RequestQueue<string>;

  beforeEach(() => {
    clock = new ManualLbClock2(0);
    q = new RequestQueue<string>({ maxDepth: 3, maxWaitMs: 1_000, clock });
  });

  it('enqueues and dequeues FIFO', () => {
    q.enqueue('b', 'r1', 'a');
    q.enqueue('b', 'r2', 'b');
    expect(q.depth('b')).toBe(2);
    const d1 = q.dequeue('b');
    expect(d1.kind).toBe('request');
    if (d1.kind === 'request') expect(d1.request.requestId).toBe('r1');
    const d2 = q.dequeue('b');
    if (d2.kind === 'request') expect(d2.request.requestId).toBe('r2');
    expect(q.dequeue('b').kind).toBe('empty');
  });

  it('rejects enqueue beyond maxDepth', () => {
    q.enqueue('b', 'r1', 'x');
    q.enqueue('b', 'r2', 'x');
    q.enqueue('b', 'r3', 'x');
    const res = q.enqueue('b', 'r4', 'x');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('full');
    expect(q.stats.dropped).toBe(1);
  });

  it('rejects duplicate requestIds', () => {
    q.enqueue('b', 'r1', 'x');
    const res = q.enqueue('b', 'r1', 'x');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('duplicate');
  });

  it('expires queued requests after maxWaitMs', () => {
    q.enqueue('b', 'r1', 'x');
    q.enqueue('b', 'r2', 'y');
    clock.advance(1_001);
    expect(q.depth('b')).toBe(0);
    expect(q.dequeue('b').kind).toBe('empty');
    expect(q.stats.expired).toBe(2);
  });

  it('skips expired head but serves live tail', () => {
    q.enqueue('b', 'old', 'x');
    clock.advance(500);
    q.enqueue('b', 'new', 'y'); // deadline at 1500
    clock.advance(600); // now=1100: 'old' expired, 'new' live
    const d = q.dequeue('b');
    expect(d.kind).toBe('request');
    if (d.kind === 'request') expect(d.request.requestId).toBe('new');
  });

  it('clear drops all queued items', () => {
    q.enqueue('b', 'r1', 'x');
    q.enqueue('b', 'r2', 'y');
    expect(q.clear('b')).toBe(2);
    expect(q.depth('b')).toBe(0);
  });

  it('queues are independent per backend', () => {
    q.enqueue('a', 'r1', 'x');
    q.enqueue('b', 'r2', 'y');
    expect(q.depth('a')).toBe(1);
    expect(q.depth('b')).toBe(1);
    q.dequeue('a');
    expect(q.depth('a')).toBe(0);
    expect(q.depth('b')).toBe(1);
  });
});

describe('SessionPersistence', () => {
  let clock: ManualLbClock2;
  let sp: SessionPersistence;
  const pool = [bk('b1'), bk('b2'), bk('b3')];

  beforeEach(() => {
    clock = new ManualLbClock2(0);
    sp = new SessionPersistence({ secret: 'test-secret-key', ttlMs: 60_000, clock });
  });

  it('issues cookies that read back the backend id', () => {
    const c = sp.issueCookie('b2');
    expect(sp.readCookie(c)).toBe('b2');
  });

  it('rejects tampered cookies', () => {
    const c = sp.issueCookie('b2');
    const tampered = c.slice(0, -2) + 'xx';
    expect(sp.readCookie(tampered)).toBeNull();
    const other = new SessionPersistence({ secret: 'different-secret', clock });
    expect(other.readCookie(c)).toBeNull();
  });

  it('expires cookies after ttl', () => {
    const c = sp.issueCookie('b1');
    clock.advance(61_000);
    expect(sp.readCookie(c)).toBeNull();
  });

  it('remembers memory bindings and expires them', () => {
    sp.bind('sess-1', 'b3');
    expect(sp.lookup('sess-1')).toBe('b3');
    clock.advance(61_000);
    expect(sp.lookup('sess-1')).toBeNull();
  });

  it('hashPick is deterministic and minimal-remap', () => {
    const ids = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
    const before = new Map(ids.map((u) => [u, sp.hashPick(u, pool)!.id]));
    // Remove b3 — only identities that mapped to b3 should move.
    const after = new Map(
      ids.map((u) => [u, sp.hashPick(u, pool.filter((b) => b.id !== 'b3'))!.id])
    );
    for (const u of ids) {
      if (before.get(u) !== 'b3') {
        expect(after.get(u)).toBe(before.get(u));
      }
    }
  });

  it('resolve prefers cookie > memory > hash', () => {
    const cookie = sp.issueCookie('b1');
    sp.bind('s', 'b2');
    const r1 = sp.resolve({ cookie, sessionKey: 's', identity: 'u' }, pool);
    expect(r1?.backendId).toBe('b1');
    expect(r1?.via).toBe('cookie');
    const r2 = sp.resolve({ sessionKey: 's', identity: 'u' }, pool);
    expect(r2?.backendId).toBe('b2');
    expect(r2?.via).toBe('memory');
    const r3 = sp.resolve({ identity: 'stable-user' }, pool);
    expect(r3?.via).toBe('hash');
    expect(r3?.backendId).toBe(sp.hashPick('stable-user', pool)!.id);
  });

  it('resolve ignores bindings for backends not in candidates', () => {
    const cookie = sp.issueCookie('b-gone');
    const r = sp.resolve({ cookie, identity: 'u' }, pool);
    expect(r?.via).toBe('hash');
  });

  it('unbindBackend clears sessions', () => {
    sp.bind('s1', 'b1');
    sp.bind('s2', 'b2');
    sp.bind('s3', 'b1');
    expect(sp.unbindBackend('b1')).toBe(2);
    expect(sp.lookup('s2')).toBe('b2');
  });
});

describe('BackendMetrics', () => {
  let clock: ManualLbClock2;
  let m: BackendMetrics;

  beforeEach(() => {
    clock = new ManualLbClock2(0);
    m = new BackendMetrics({ reservoirSize: 64, rpsWindowSec: 10, clock });
    m.track('b');
  });

  it('counts requests and inflight', () => {
    m.recordStart('b');
    m.recordStart('b');
    expect(m.snapshot('b')!.inflight).toBe(2);
    m.recordEnd('b', true, 5);
    expect(m.snapshot('b')!.inflight).toBe(1);
    expect(m.snapshot('b')!.ok).toBe(1);
    m.recordEnd('b', false, 9);
    expect(m.snapshot('b')!.errors).toBe(1);
  });

  it('computes percentiles over the reservoir', () => {
    for (let i = 1; i <= 100; i++) {
      m.recordStart('b');
      m.recordEnd('b', true, i); // latencies 1..100
    }
    const l = m.latency('b');
    expect(l.count).toBe(64); // reservoir cap
    expect(l.minMs).toBeGreaterThan(0);
    expect(l.p50Ms).toBeLessThanOrEqual(l.p90Ms);
    expect(l.p90Ms).toBeLessThanOrEqual(l.p95Ms);
    expect(l.p95Ms).toBeLessThanOrEqual(l.p99Ms);
    expect(l.maxMs).toBeLessThanOrEqual(100);
  });

  it('small reservoir gives exact percentiles', () => {
    const exact = new BackendMetrics({ reservoirSize: 16, clock });
    exact.track('x');
    for (const v of [10, 20, 30, 40, 50]) {
      exact.recordStart('x');
      exact.recordEnd('x', true, v);
    }
    const l = exact.latency('x');
    expect(l.minMs).toBe(10);
    expect(l.maxMs).toBe(50);
    expect(l.p50Ms).toBe(30); // nearest-rank of {10,20,30,40,50}
    expect(l.meanMs).toBe(30);
  });

  it('rps reflects the rolling window', () => {
    for (let i = 0; i < 20; i++) m.recordStart('b');
    expect(m.rps('b')).toBe(2); // 20 over 10s window
    clock.advance(10_000);
    expect(m.rps('b')).toBe(0); // window expired
  });

  it('time() wraps calls', () => {
    clock.set(0);
    const out = m.time('b', () => {
      clock.advance(7);
      return 42;
    });
    expect(out).toBe(42);
    const l = m.latency('b');
    expect(l.count).toBe(1);
    expect(l.maxMs).toBe(7);
    expect(m.snapshot('b')!.ok).toBe(1);
  });

  it('time() records failures', () => {
    expect(() =>
      m.time('b', () => {
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(m.snapshot('b')!.errors).toBe(1);
  });
});

describe('ResilientPool', () => {
  let clock: ManualLbClock2;
  let pool: ResilientPool<undefined>;

  beforeEach(() => {
    clock = new ManualLbClock2(0);
    pool = new ResilientPool<undefined>([bk('a'), bk('b'), bk('c')], {
      outlier: { consecutiveFailureThreshold: 2, baseEjectMs: 1_000 },
      slowStart: { windowMs: 500, minWeightPercent: 0.1 },
      session: { secret: 'pool-secret-1', ttlMs: 60_000 },
      clock,
    });
  });

  it('routes to an eligible backend', () => {
    const d = pool.route('req-1');
    expect(d).not.toBeNull();
    expect(['a', 'b', 'c']).toContain(d!.backend.id);
    expect(d!.queued).toBe(false);
  });

  it('ejects a backend after consecutive failures', () => {
    pool.recordStart('a');
    pool.report('a', false, 10);
    pool.recordStart('a');
    pool.report('a', false, 10);
    const snap = pool.snapshot().find((s) => s.id === 'a');
    expect(snap!.state).toBe('ejected');
    // ejected backend never routed
    for (let i = 0; i < 20; i++) {
      const d = pool.route(`r${i}`);
      expect(d!.backend.id).not.toBe('a');
    }
  });

  it('recovers via ramping after ejection expiry', () => {
    pool.report('a', false, 1);
    pool.report('a', false, 1);
    clock.advance(1_001);
    const { recovered } = pool.tick();
    expect(recovered).toEqual(['a']);
    const snap = pool.snapshot().find((s) => s.id === 'a');
    expect(snap!.state).toBe('ramping');
    expect(snap!.effectiveWeight).toBeLessThan(10);
    clock.advance(600);
    const { rampFinished } = pool.tick();
    expect(rampFinished).toEqual(['a']);
    expect(pool.snapshot().find((s) => s.id === 'a')!.state).toBe('active');
  });

  it('draining backends get no new routes', () => {
    pool.drain('b');
    pool.drain('c');
    for (let i = 0; i < 10; i++) {
      expect(pool.route(`r${i}`)!.backend.id).toBe('a');
    }
  });

  it('returns null when all backends are ejected', () => {
    for (const id of ['a', 'b', 'c']) {
      pool.report(id, false, 1);
      pool.report(id, false, 1);
    }
    expect(pool.route('r')).toBeNull();
  });

  it('sticky cookie pins subsequent routes', () => {
    const cookie = pool.affinityCookie('c')!;
    for (let i = 0; i < 10; i++) {
      const d = pool.route(`r${i}`, { cookie });
      expect(d!.backend.id).toBe('c');
      expect(d!.sticky).toBe(true);
    }
  });

  it('sticky identity binds consistently', () => {
    const first = pool.route('r0', { identity: 'user-9' });
    expect(first!.sticky).toBe(true);
    const bound = first!.backend.id;
    for (let i = 0; i < 5; i++) {
      expect(pool.route(`r${i}`, { identity: 'user-9' })!.backend.id).toBe(bound);
    }
  });

  it('clears queue and bindings on ejection', () => {
    pool.queue.enqueue('a', 'q1', undefined);
    const cookie = pool.affinityCookie('a')!;
    pool.route('r', { sessionKey: 's', identity: 'u' });
    pool.sessions!.bind('s', 'a');
    pool.report('a', false, 1);
    pool.report('a', false, 1);
    expect(pool.queue.depth('a')).toBe(0);
    expect(pool.sessions!.lookup('s')).toBeNull();
    expect(pool.sessions!.readCookie(cookie)).toBe('a'); // cookie still valid…
    const d = pool.route('r2', { cookie });
    expect(d!.backend.id).not.toBe('a'); // …but backend is not eligible
  });
});
