/**
 * Tests for the deepened throttling layer: DistributedRateLimiter +
 * InMemoryDistributedClient, QuotaManager, PenaltyBox, CompositeThrottle.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DistributedRateLimiter,
  InMemoryDistributedClient,
} from '../distributed/DistributedRateLimiter';
import { QuotaManager, QuotaPeriod } from '../quota/QuotaManager';
import { PenaltyBox } from '../penalty/PenaltyBox';
import {
  CompositeThrottle,
  TokenBucketGate,
  ConcurrencyGate,
  FixedWindowGate,
  PredicateGate,
} from '../composition/CompositeThrottle';
import type { ThrottleGate, GateResult } from '../composition/CompositeThrottle';

function manualClock(start = 1_700_000_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    set: (v: number) => {
      now = v;
    },
  };
}

/* ------------------------------------------------------------------ */
/* DistributedRateLimiter                                              */
/* ------------------------------------------------------------------ */

describe('InMemoryDistributedClient', () => {
  it('incr on missing key starts at 1', async () => {
    const c = new InMemoryDistributedClient();
    expect(await c.incr('k')).toBe(1);
    expect(await c.incr('k')).toBe(2);
  });

  it('keys expire lazily after pexpire', async () => {
    const clock = manualClock();
    const c = new InMemoryDistributedClient(clock.now);
    await c.set('k', 'v');
    await c.pexpire('k', 1000);
    expect(await c.get('k')).toBe('v');
    clock.advance(1001);
    expect(await c.get('k')).toBeNull();
    expect(await c.pttl('k')).toBe(-2);
  });

  it('pttl reports -1 for no-TTL and -2 for missing', async () => {
    const c = new InMemoryDistributedClient();
    await c.set('persist', 'v');
    expect(await c.pttl('persist')).toBe(-1);
    expect(await c.pttl('nope')).toBe(-2);
  });

  it('zset membership: zadd/zcard/zremrangebyscore/zrange', async () => {
    const c = new InMemoryDistributedClient();
    await c.zadd('z', 10, 'a');
    await c.zadd('z', 20, 'b');
    await c.zadd('z', 30, 'c');
    expect(await c.zcard('z')).toBe(3);
    expect(await c.zremrangebyscore('z', -Infinity, 20)).toBe(2);
    expect(await c.zcard('z')).toBe(1);
    expect(await c.zrange('z', 0, -1)).toEqual(['c']);
  });

  it('hmget/hmset round-trip', async () => {
    const c = new InMemoryDistributedClient();
    await c.hmset('h', { a: '1', b: 'two' });
    expect(await c.hmget('h', ['a', 'b', 'missing'])).toEqual(['1', 'two', null]);
  });
});

describe('DistributedRateLimiter — fixed window', () => {
  let clock: ReturnType<typeof manualClock>;
  let limiter: DistributedRateLimiter;

  beforeEach(() => {
    clock = manualClock();
    limiter = new DistributedRateLimiter({
      client: new InMemoryDistributedClient(clock.now),
      now: clock.now,
    });
  });

  it('admits up to the limit then rejects', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await limiter.checkFixedWindow('u', 3, 60_000);
      expect(r.allowed).toBe(true);
      expect(r.current).toBe(i + 1);
    }
    const r = await limiter.checkFixedWindow('u', 3, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('resets at the window boundary', async () => {
    const windowMs = 60_000;
    // Start at a boundary-aligned time for deterministic behavior.
    clock.set(60_000 * 1000);
    await limiter.checkFixedWindow('u', 1, windowMs);
    const reject = await limiter.checkFixedWindow('u', 1, windowMs);
    expect(reject.allowed).toBe(false);
    clock.advance(windowMs); // next bucket
    const r = await limiter.checkFixedWindow('u', 1, windowMs);
    expect(r.allowed).toBe(true);
    expect(r.current).toBe(1);
  });

  it('resetTime points at the end of the current bucket', async () => {
    clock.set(60_000 * 500 + 10_000); // 10s into a bucket
    const r = await limiter.checkFixedWindow('u', 5, 60_000);
    // Lua semantics: PX is set to the full window on first hit, so
    // PTTL ≈ window → resetTime ≈ now + window (not the true boundary).
    expect(r.resetTime).toBeCloseTo(clock.now() + 60_000, -3);
  });
});

describe('DistributedRateLimiter — sliding window log', () => {
  let clock: ReturnType<typeof manualClock>;
  let limiter: DistributedRateLimiter;

  beforeEach(() => {
    clock = manualClock();
    limiter = new DistributedRateLimiter({
      client: new InMemoryDistributedClient(clock.now),
      now: clock.now,
    });
  });

  it('admits exactly `limit` requests inside the window', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await limiter.checkSlidingWindowLog('u', 5, 10_000)).allowed).toBe(true);
    }
    const r = await limiter.checkSlidingWindowLog('u', 5, 10_000);
    expect(r.allowed).toBe(false);
  });

  it('slides — old entries expire individually, not at a boundary', async () => {
    await limiter.checkSlidingWindowLog('u', 2, 10_000); // t=0
    clock.advance(9_000);
    await limiter.checkSlidingWindowLog('u', 2, 10_000); // t=9s
    expect((await limiter.checkSlidingWindowLog('u', 2, 10_000)).allowed).toBe(false);
    clock.advance(1_001); // t=10s+ — first entry aged out
    expect((await limiter.checkSlidingWindowLog('u', 2, 10_000)).allowed).toBe(true);
  });

  it('rejected requests do not consume window slots', async () => {
    await limiter.checkSlidingWindowLog('u', 1, 10_000);
    await limiter.checkSlidingWindowLog('u', 1, 10_000); // rejected, no slot
    const res = await limiter.checkSlidingWindowLog('u', 1, 10_000);
    expect(res.allowed).toBe(false);
    expect(res.current).toBe(1); // only the admitted request is logged
  });

  it('resetTime is oldest-entry + window when rejected', async () => {
    const t0 = clock.now();
    await limiter.checkSlidingWindowLog('u', 1, 10_000);
    const r = await limiter.checkSlidingWindowLog('u', 1, 10_000);
    expect(r.resetTime).toBeCloseTo(t0 + 10_000, -2);
  });
});

describe('DistributedRateLimiter — token bucket', () => {
  let clock: ReturnType<typeof manualClock>;
  let limiter: DistributedRateLimiter;

  beforeEach(() => {
    clock = manualClock();
    limiter = new DistributedRateLimiter({
      client: new InMemoryDistributedClient(clock.now),
      now: clock.now,
    });
  });

  it('starts full and decrements per request', async () => {
    const r1 = await limiter.checkTokenBucket('u', 10, 0.001); // 1 token/ms
    expect(r1.allowed).toBe(true);
    expect(r1.tokensRemaining).toBeCloseTo(9);
    const r2 = await limiter.checkTokenBucket('u', 10, 0.001, 5);
    expect(r2.allowed).toBe(true);
    expect(r2.tokensRemaining).toBeCloseTo(4);
  });

  it('rejects when tokens are insufficient and reports waitTime', async () => {
    await limiter.checkTokenBucket('u', 5, 0.001, 5); // empty
    const r = await limiter.checkTokenBucket('u', 5, 0.001, 1);
    expect(r.allowed).toBe(false);
    expect(r.waitTimeMs).toBeCloseTo(1000, -1); // 1 token at 1/sec
  });

  it('refills over time', async () => {
    await limiter.checkTokenBucket('u', 10, 0.01, 10); // empty, 10 tokens/ms→0.01
    clock.advance(500); // +5 tokens
    const r = await limiter.checkTokenBucket('u', 10, 0.01, 5);
    expect(r.allowed).toBe(true);
  });

  it('rejection still persists the refilled level (no refund race)', async () => {
    await limiter.checkTokenBucket('u', 5, 0.001, 5); // empty
    clock.advance(3_000); // 3 tokens refilled
    await limiter.checkTokenBucket('u', 5, 0.001, 5); // reject: needs 5, has 3
    // A second call sees the persisted 3-token state, not a re-refill.
    const r = await limiter.checkTokenBucket('u', 5, 0.001, 3);
    expect(r.allowed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* QuotaManager                                                        */
/* ------------------------------------------------------------------ */

describe('QuotaManager', () => {
  let clock: ReturnType<typeof manualClock>;
  let quota: QuotaManager;

  // Anchor to a known UTC day boundary for calendar tests:
  // 2023-11-15T00:00:00Z = 1700006400000
  const DAY_START = 1_700_006_400_000;

  beforeEach(() => {
    clock = manualClock(DAY_START + 12 * 3600_000); // noon UTC
    quota = new QuotaManager({ now: clock.now });
  });

  it('admits up to the daily limit then rejects', () => {
    quota.configure('u', [{ name: 'req', limit: 3, period: QuotaPeriod.DAILY }]);
    expect(quota.consume('u').allowed).toBe(true);
    expect(quota.consume('u').allowed).toBe(true);
    expect(quota.consume('u').allowed).toBe(true);
    const r = quota.consume('u');
    expect(r.allowed).toBe(false);
    expect(r.binding).toBe('req');
  });

  it('daily quota resets at UTC midnight', () => {
    quota.configure('u', [{ name: 'req', limit: 1, period: QuotaPeriod.DAILY }]);
    quota.consume('u');
    expect(quota.consume('u').allowed).toBe(false);
    clock.advance(12 * 3600_000 + 1); // past midnight UTC
    expect(quota.consume('u').allowed).toBe(true);
  });

  it('monthly quota resets on the 1st', () => {
    // Set to Nov 30, 23:59 UTC
    clock.set(Date.UTC(2023, 10, 30, 23, 59));
    quota.configure('u', [{ name: 'req', limit: 1, period: QuotaPeriod.MONTHLY }]);
    quota.consume('u');
    expect(quota.consume('u').allowed).toBe(false);
    clock.advance(120_000); // Dec 1
    expect(quota.consume('u').allowed).toBe(true);
  });

  it('custom window uses epoch-anchored tumbling periods', () => {
    quota.configure('u', [{ name: 'req', limit: 2, period: QuotaPeriod.CUSTOM, windowMs: 1000 }]);
    const t0 = clock.now();
    quota.consume('u');
    quota.consume('u');
    expect(quota.consume('u').allowed).toBe(false);
    clock.set(t0 - (t0 % 1000) + 1000); // next window boundary
    expect(quota.consume('u').allowed).toBe(true);
  });

  it('rollover carries unused units into the next period, capped', () => {
    quota.configure('u', [
      { name: 'req', limit: 10, period: QuotaPeriod.DAILY, maxRollover: 5 },
    ]);
    // Use only 2 of 10 — 8 leftover, capped at 5.
    quota.consume('u', 2);
    clock.advance(13 * 3600_000); // next day
    const b = quota.peek('u').get('req');
    expect(b?.carried).toBe(5);
    expect(b?.remaining).toBe(15); // 10 + 5 carried
  });

  it('no rollover by default — use it or lose it', () => {
    quota.configure('u', [{ name: 'req', limit: 10, period: QuotaPeriod.DAILY }]);
    quota.consume('u', 2);
    clock.advance(13 * 3600_000);
    expect(quota.peek('u').get('req')?.remaining).toBe(10);
  });

  it('atomic consume: multi-quota rejection debits nothing', () => {
    quota.configure('u', [
      { name: 'a', limit: 100, period: QuotaPeriod.DAILY },
      { name: 'b', limit: 1, period: QuotaPeriod.DAILY },
    ]);
    quota.consume('u'); // b now used=1
    const r = quota.consume('u');
    expect(r.allowed).toBe(false);
    expect(r.binding).toBe('b');
    // 'a' was NOT debited by the rejected request.
    expect(quota.peek('u').get('a')?.used).toBe(1);
  });

  it('quotaHeaders computes X-RateLimit-* for the binding quota', () => {
    quota.configure('u', [
      { name: 'a', limit: 100, period: QuotaPeriod.DAILY },
      { name: 'b', limit: 5, period: QuotaPeriod.DAILY },
    ]);
    quota.consume('u');
    const h = quota.quotaHeaders('u');
    expect(h).not.toBeNull();
    expect(h?.['X-RateLimit-Limit']).toBe(5); // 'b' is binding
    expect(h?.['X-RateLimit-Remaining']).toBe(4);
    expect(h?.['X-RateLimit-Reset']).toBeGreaterThan(clock.now() / 1000);
  });

  it('Retry-After present only when rejected', () => {
    quota.configure('u', [{ name: 'req', limit: 1, period: QuotaPeriod.DAILY }]);
    quota.consume('u');
    quota.consume('u');
    const ok = quota.quotaHeaders('u', false);
    expect(ok?.['Retry-After']).toBeUndefined();
    const rej = quota.quotaHeaders('u', true);
    expect(rej?.['Retry-After']).toBeGreaterThan(0);
  });

  it('grant adds headroom via carried', () => {
    quota.configure('u', [{ name: 'req', limit: 2, period: QuotaPeriod.DAILY }]);
    quota.consume('u');
    quota.consume('u');
    expect(quota.consume('u').allowed).toBe(false);
    quota.grant('u', 'req', 3);
    expect(quota.consume('u').allowed).toBe(true);
  });

  it('snapshot/restore preserves state across managers', () => {
    quota.configure('u', [{ name: 'req', limit: 5, period: QuotaPeriod.CUSTOM, windowMs: 60_000 }]);
    quota.consume('u');
    quota.consume('u');
    const snap = quota.snapshot();
    const restored = new QuotaManager({ now: clock.now });
    restored.restore(snap);
    // Ledger restored — but the def isn't, so configure it too.
    restored.configure('u', [{ name: 'req', limit: 5, period: QuotaPeriod.CUSTOM, windowMs: 60_000 }]);
    expect(restored.peek('u').get('req')?.used).toBe(2);
  });

  it('unconfigured identifiers are admitted unconstrained', () => {
    const r = quota.consume('ghost');
    expect(r.allowed).toBe(true);
    expect(quota.quotaHeaders('ghost')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* PenaltyBox                                                          */
/* ------------------------------------------------------------------ */

describe('PenaltyBox', () => {
  let clock: ReturnType<typeof manualClock>;
  let box: PenaltyBox;

  beforeEach(() => {
    clock = manualClock();
    box = new PenaltyBox({
      baseTimeoutMs: 1000,
      escalation: 2,
      maxTimeoutMs: 30_000,
      resetAfterMs: 60_000,
      now: clock.now,
    });
  });

  it('first violation gets the base timeout', () => {
    const rec = box.recordViolation('u');
    expect(rec.penalized).toBe(true);
    expect(rec.remainingMs).toBe(1000);
    expect(box.isPenalized('u')).toBe(true);
  });

  it('escalates exponentially per offense', () => {
    box.recordViolation('u'); // 1s
    clock.advance(1001);
    const rec2 = box.recordViolation('u'); // offense 2 → 2s
    expect(rec2.remainingMs).toBe(2000);
    clock.advance(2001);
    const rec3 = box.recordViolation('u'); // offense 3 → 4s
    expect(rec3.remainingMs).toBe(4000);
  });

  it('caps at maxTimeoutMs', () => {
    for (let i = 0; i < 10; i++) {
      clock.advance(box.remainingMs('u') + 1);
      box.recordViolation('u');
    }
    expect(box.remainingMs('u')).toBeLessThanOrEqual(30_000);
  });

  it('automatic release after timeout — check allows again', () => {
    box.recordViolation('u');
    expect(box.check('u').allowed).toBe(false);
    clock.advance(1001);
    expect(box.check('u').allowed).toBe(true);
    // But offense count persists — next violation re-escalates.
    box.recordViolation('u');
    expect(box.remainingMs('u')).toBe(2000);
  });

  it('clean period forgives the offense count', () => {
    box.recordViolation('u'); // 1s penalty, offense 1
    clock.advance(61_000); // penalty done + resetAfter elapsed
    expect(box.check('u').offenseCount).toBe(0);
    box.recordViolation('u'); // back to offense 1 → base timeout
    expect(box.remainingMs('u')).toBe(1000);
  });

  it('weighted violations escalate faster', () => {
    const rec = box.recordViolation('u', 3); // offense 3 → 4s immediately
    expect(rec.offenseCount).toBe(3);
    expect(rec.remainingMs).toBe(4000);
  });

  it('violation while penalized extends from now', () => {
    box.recordViolation('u'); // 1s
    clock.advance(500);
    box.recordViolation('u'); // offense 2 → 2s from now
    expect(box.remainingMs('u')).toBe(2000);
  });

  it('pardon clears all state', () => {
    box.recordViolation('u');
    box.recordViolation('u');
    box.pardon('u');
    expect(box.isPenalized('u')).toBe(false);
    expect(box.record('u')).toBeNull();
    expect(box.check('u').offenseCount).toBe(0);
  });

  it('sweep prunes only fully-forgiven entries', () => {
    box.recordViolation('short');
    clock.advance(61_000); // 'short' fully forgiven (penalty + resetAfter)
    box.recordViolation('long', 5); // late offense → 16s penalty still running
    const pruned = box.sweep();
    expect(pruned).toBe(1);
    expect(box.trackedCount).toBe(1);
    expect(box.isPenalized('long')).toBe(true);
  });

  it('untracked identifiers are free', () => {
    expect(box.isPenalized('nope')).toBe(false);
    expect(box.check('nope')).toEqual({ allowed: true, remainingMs: 0, offenseCount: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* CompositeThrottle                                                   */
/* ------------------------------------------------------------------ */

describe('CompositeThrottle', () => {
  let clock: ReturnType<typeof manualClock>;

  beforeEach(() => {
    clock = manualClock();
  });

  function gate(name: string, passing: boolean, undoable = false): ThrottleGate & { undos: number } {
    const g = {
      name,
      undos: 0,
      tryPass: (): GateResult =>
        passing ? { passed: true } : { passed: false, reason: 'no', retryAfterMs: 42 },
    } as ThrottleGate & { undos: number };
    if (undoable) {
      g.undo = () => {
        g.undos++;
      };
    }
    return g;
  }

  it('AND: admits when all gates pass', () => {
    const c = new CompositeThrottle({ mode: 'all' }, [gate('a', true), gate('b', true)]);
    const d = c.admit();
    expect(d.allowed).toBe(true);
    expect(d.rejectedBy).toEqual([]);
  });

  it('AND: rejects on first failing gate and names it', () => {
    const c = new CompositeThrottle({ mode: 'all' }, [gate('a', true), gate('b', false), gate('c', true)]);
    const d = c.admit();
    expect(d.allowed).toBe(false);
    expect(d.rejectedBy).toEqual(['b']);
    expect(d.retryAfterMs).toBe(42);
  });

  it('AND: undoes consumed capacity of earlier gates on rejection', () => {
    const a = gate('a', true, true);
    const c = new CompositeThrottle({ mode: 'all' }, [a, gate('b', false)]);
    c.admit();
    expect(a.undos).toBe(1);
  });

  it('AND: short-circuits — gates after the failure are not evaluated', () => {
    const c = new CompositeThrottle({ mode: 'all' }, [gate('a', false), gate('b', true)]);
    c.admit();
    const m = c.metrics();
    expect(m[0].evaluated).toBe(1);
    expect(m[1].evaluated).toBe(0);
  });

  it('AND: evaluateAll mode runs every gate for complete metrics', () => {
    const c = new CompositeThrottle(
      { mode: 'all', evaluateAll: true },
      [gate('a', false), gate('b', false)]
    );
    const d = c.admit();
    expect(d.rejectedBy).toEqual(['a', 'b']);
    expect(c.metrics().every((m) => m.evaluated === 1)).toBe(true);
  });

  it('OR: admits on first passing gate and skips the rest', () => {
    const c = new CompositeThrottle({ mode: 'any' }, [gate('a', false), gate('b', true), gate('c', true)]);
    const d = c.admit();
    expect(d.allowed).toBe(true);
    expect(c.metrics()[2].evaluated).toBe(0);
  });

  it('OR: rejects only when every gate fails', () => {
    const c = new CompositeThrottle({ mode: 'any' }, [gate('a', false), gate('b', false)]);
    const d = c.admit();
    expect(d.allowed).toBe(false);
    expect(d.rejectedBy).toEqual(['a', 'b']);
  });

  it('per-gate metrics accumulate across admits', () => {
    const a = gate('a', true);
    const c = new CompositeThrottle({ mode: 'all' }, [a, gate('b', false)]);
    c.admit();
    c.admit();
    const [ma, mb] = c.metrics();
    expect(ma).toEqual({ name: 'a', evaluated: 2, passed: 2, rejected: 0, rolledBack: 0 });
    expect(mb.rejected).toBe(2);
  });

  it('TokenBucketGate: pass consumes, undo refunds', () => {
    const bucket = new TokenBucketGate('tb', { ratePerSec: 10, capacity: 3, now: clock.now });
    const c = new CompositeThrottle({ mode: 'all' }, [bucket, gate('x', false)]);
    c.admit();
    // Rejection refunded the token.
    expect(bucket.tokens).toBeCloseTo(3);
    const solo = new CompositeThrottle({ mode: 'all' }, [bucket]);
    expect(solo.admit().allowed).toBe(true);
    expect(solo.admit().allowed).toBe(true);
    expect(solo.admit().allowed).toBe(true);
    expect(solo.admit().allowed).toBe(false);
  });

  it('ConcurrencyGate: caps permits; release returns them', () => {
    const conc = new ConcurrencyGate('cc', { maxConcurrent: 2 });
    const c = new CompositeThrottle({ mode: 'all' }, [conc]);
    expect(c.admit().allowed).toBe(true);
    expect(c.admit().allowed).toBe(true);
    expect(c.admit().allowed).toBe(false);
    conc.release();
    expect(c.admit().allowed).toBe(true);
  });

  it('ConcurrencyGate: undo returns the permit on AND-failure', () => {
    const conc = new ConcurrencyGate('cc', { maxConcurrent: 1 });
    const c = new CompositeThrottle({ mode: 'all' }, [conc, gate('x', false)]);
    c.admit();
    expect(conc.inFlight).toBe(0); // permit rolled back
  });

  it('FixedWindowGate: enforces limit per window bucket', () => {
    const fw = new FixedWindowGate('fw', { limit: 2, windowMs: 1000, now: clock.now });
    const c = new CompositeThrottle({ mode: 'all' }, [fw]);
    expect(c.admit().allowed).toBe(true);
    expect(c.admit().allowed).toBe(true);
    expect(c.admit().allowed).toBe(false);
    clock.set(clock.now() - (clock.now() % 1000) + 1000);
    expect(c.admit().allowed).toBe(true);
  });

  it('PredicateGate: wraps arbitrary checks', () => {
    let flag = true;
    const c = new CompositeThrottle({ mode: 'all' }, [new PredicateGate('flag', () => flag)]);
    expect(c.admit().allowed).toBe(true);
    flag = false;
    const d = c.admit();
    expect(d.allowed).toBe(false);
    expect(d.rejectedBy).toEqual(['flag']);
  });

  it('realistic stack: bucket AND concurrency AND penalty-box predicate', () => {
    const box = new PenaltyBox({
      baseTimeoutMs: 1000,
      maxTimeoutMs: 10_000,
      resetAfterMs: 30_000,
      now: clock.now,
    });
    const c = new CompositeThrottle(
      { mode: 'all' },
      [
        new TokenBucketGate('rate', { ratePerSec: 100, capacity: 5, now: clock.now }),
        new ConcurrencyGate('conc', { maxConcurrent: 10 }),
        new PredicateGate('penalty', () => !box.isPenalized('user') || {
          passed: false,
          retryAfterMs: box.remainingMs('user'),
          reason: 'penalized',
        }),
      ]
    );
    expect(c.admit().allowed).toBe(true);
    box.recordViolation('user');
    const d = c.admit();
    expect(d.allowed).toBe(false);
    expect(d.rejectedBy).toEqual(['penalty']);
    expect(d.retryAfterMs).toBeCloseTo(1000, -1);
  });

  it('duplicate gate names rejected', () => {
    const c = new CompositeThrottle({ mode: 'all' }, [gate('a', true)]);
    expect(() => c.addGate(gate('a', true))).toThrow('duplicate');
  });
});
