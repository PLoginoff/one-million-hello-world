/**
 * Rate-Limiting Engine — unit tests.
 *
 * Every time-dependent path uses `ManualRateLimitClock`; the token
 * bucket is tested through both its stateless API (state-in/state-out)
 * and the in-memory convenience wrapper.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  SlidingWindowLogLimiter as SlidingWindowLog,
  QuotaBuckets,
  PenaltyEscalator,
  TokenBucket,
  LimitHeaders,
  ManualRateLimitClock,
  BucketState,
  QuotaContext,
} from '../index';

/* ------------------------------------------------------------------ */
/* SlidingWindowLog                                                    */
/* ------------------------------------------------------------------ */

describe('SlidingWindowLog', () => {
  let clock: ManualRateLimitClock;
  let log: SlidingWindowLog;

  beforeEach(() => {
    clock = new ManualRateLimitClock();
    log = new SlidingWindowLog({ windowMs: 10_000, clock });
  });

  it('counts requests exactly inside the window', () => {
    for (let i = 0; i < 5; i++) {
      const d = log.hit('k', 10);
      expect(d.allowed).toBe(true);
      expect(d.count).toBe(i + 1);
    }
    expect(log.count('k')).toBe(5);
  });

  it('denies at the limit and reports retryAfterMs from the oldest entry', () => {
    for (let i = 0; i < 3; i++) {
      log.hit('k', 3);
      clock.advance(1000); // t=0,1000,2000
    }
    clock.advance(1000); // t=4000
    const d = log.hit('k', 3);
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
    // Oldest entry (t=0) exits at t=10000 → 6000ms from t=4000.
    expect(d.retryAfterMs).toBe(6000);
    // Denied hits don't consume quota.
    expect(log.count('k')).toBe(3);
  });

  it('sliding (not fixed): old requests expire mid-window', () => {
    log.hit('k', 2); // t=0
    clock.advance(5000);
    log.hit('k', 2); // t=5000 — full
    clock.advance(5001); // t=10001: first request expired
    const d = log.hit('k', 2);
    expect(d.allowed).toBe(true); // room reopened exactly at expiry
    expect(log.count('k')).toBe(2);
  });

  it('remaining() peeks without consuming', () => {
    log.hit('k', 5);
    expect(log.remaining('k', 5)).toBe(4);
    expect(log.remaining('k', 5)).toBe(4); // peek doesn't consume
    expect(log.count('k')).toBe(1);
  });

  it('keys are independent', () => {
    for (let i = 0; i < 3; i++) log.hit('a', 3);
    expect(log.hit('a', 3).allowed).toBe(false);
    expect(log.hit('b', 3).allowed).toBe(true);
  });

  it('sweep evicts fully-expired keys', () => {
    log.hit('a', 10);
    log.hit('b', 10);
    clock.advance(11_000);
    expect(log.sweep()).toBe(2);
    expect(log.trackedKeys).toBe(0);
  });

  it('unhit removes the most recent entry', () => {
    log.hit('k', 5);
    clock.advance(100);
    log.hit('k', 5);
    expect(log.count('k')).toBe(2);
    expect(log.unhit('k')).toBe(true);
    expect(log.count('k')).toBe(1);
    expect(log.unhit('k')).toBe(true);
    expect(log.unhit('k')).toBe(false);
  });

  it('bounds memory with maxLogSize', () => {
    const l = new SlidingWindowLog({ windowMs: 60_000, maxLogSize: 5, clock });
    for (let i = 0; i < 10; i++) {
      l.hit('k', 100);
      clock.advance(100);
    }
    expect(l.count('k')).toBeLessThanOrEqual(5);
  });
});

/* ------------------------------------------------------------------ */
/* QuotaBuckets                                                        */
/* ------------------------------------------------------------------ */

describe('QuotaBuckets', () => {
  let clock: ManualRateLimitClock;
  let buckets: QuotaBuckets;
  const ctx = (ip = '1.1.1.1', route = '/api', user = 'u1'): QuotaContext => ({
    ip,
    route,
    userId: user,
  });

  beforeEach(() => {
    clock = new ManualRateLimitClock();
    buckets = new QuotaBuckets([
      { name: 'ip', keyOf: (c) => c.ip ?? null, capacity: 3, windowMs: 10_000 },
      { name: 'route', keyOf: (c) => c.route ?? null, capacity: 5, windowMs: 10_000 },
      { name: 'user', keyOf: (c) => c.userId ?? null, capacity: 2, windowMs: 10_000 },
    ], clock);
  });

  it('allows when all dimensions have room', () => {
    const r = buckets.check(ctx());
    expect(r.allowed).toBe(true);
    expect(r.remaining['ip']).toBe(2);
    expect(r.remaining['user']).toBe(1);
  });

  it('denies on the tightest dimension and names it', () => {
    buckets.check(ctx()); // user: 1/2
    buckets.check(ctx()); // user: 2/2 — full
    const r = buckets.check(ctx());
    expect(r.allowed).toBe(false);
    expect(r.deniedBy).toBe('user');
  });

  it('rolls back consumed dimensions on denial', () => {
    buckets.check(ctx()); // ip: 1/3, route: 1/5, user: 1/2
    buckets.check(ctx()); // ip: 2/3, route: 2/5, user: 2/2
    // Third check: ip+route consume then user denies → rollback.
    buckets.check(ctx());
    // ip should still be 2/3 consumed, not 3 — the third hit was rolled back.
    const peek = buckets.peek(ctx('1.1.1.1', '/other', 'u2'));
    expect(peek.remaining['ip']).toBe(1); // 3 - 2 = 1, not 0
  });

  it('skips dimensions whose key is absent', () => {
    const r = buckets.check({ ip: '9.9.9.9' }); // no route, no user
    expect(r.allowed).toBe(true);
    expect(r.remaining['route']).toBeUndefined();
    expect(r.remaining['user']).toBeUndefined();
  });

  it('dimensions are independent across keys', () => {
    buckets.check(ctx('a', '/r', 'u1'));
    buckets.check(ctx('a', '/r', 'u1')); // user u1: full
    const r = buckets.check(ctx('a', '/r', 'u2')); // different user — fine
    expect(r.allowed).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* PenaltyEscalator                                                    */
/* ------------------------------------------------------------------ */

describe('PenaltyEscalator', () => {
  let clock: ManualRateLimitClock;
  let esc: PenaltyEscalator;

  beforeEach(() => {
    clock = new ManualRateLimitClock();
    esc = new PenaltyEscalator({
      baseWindowMs: 1000,
      multiplier: 2,
      maxWindowMs: 10_000,
      resetAfterMs: 60_000,
      clock,
    });
  });

  it('first violation escalates to level 1', () => {
    const s = esc.recordViolation('k');
    expect(s.level).toBe(1);
    expect(s.effectiveWindowMs).toBe(2000); // base × 2^1
  });

  it('each violation multiplies the window', () => {
    esc.recordViolation('k');
    const s = esc.recordViolation('k');
    expect(s.level).toBe(2);
    expect(s.effectiveWindowMs).toBe(4000);
    const s3 = esc.recordViolation('k');
    expect(s3.effectiveWindowMs).toBe(8000);
  });

  it('caps the window at maxWindowMs', () => {
    for (let i = 0; i < 10; i++) {
      esc.recordViolation('k');
    }
    expect(esc.state('k').effectiveWindowMs).toBe(10_000);
  });

  it('decays to clean after resetAfterMs of silence', () => {
    esc.recordViolation('k');
    esc.recordViolation('k');
    clock.advance(61_000);
    const s = esc.state('k');
    expect(s.level).toBe(0);
    expect(s.effectiveWindowMs).toBe(1000); // back to base
  });

  it('decaysInMs counts down to the reset', () => {
    esc.recordViolation('k');
    clock.advance(20_000);
    expect(esc.state('k').decaysInMs).toBe(40_000);
  });

  it('forgive resets a violator', () => {
    esc.recordViolation('k');
    esc.forgive('k');
    expect(esc.state('k').level).toBe(0);
  });

  it('sweep drops decayed violators', () => {
    esc.recordViolation('a');
    esc.recordViolation('b');
    clock.advance(61_000);
    expect(esc.sweep()).toBe(2);
    expect(esc.trackedKeys).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* TokenBucket                                                         */
/* ------------------------------------------------------------------ */

describe('TokenBucket', () => {
  let clock: ManualRateLimitClock;
  let bucket: TokenBucket;

  beforeEach(() => {
    clock = new ManualRateLimitClock();
    bucket = new TokenBucket({ capacity: 10, refillRatePerSec: 2, clock });
  });

  it('starts full and consumes tokens', () => {
    const state = bucket.initialState();
    expect(state.tokens).toBe(10);
    const d = bucket.consume(state, 3);
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(7);
    expect(d.state.tokens).toBe(7);
  });

  it('refills over elapsed time', () => {
    let state: BucketState = { tokens: 0, lastRefillMs: 0 };
    clock.set(5000); // 5s elapsed → 10 tokens (rate 2/s), capped at 10
    const d = bucket.consume(state, 1);
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(9);
  });

  it('refill is capped at capacity', () => {
    const state: BucketState = { tokens: 5, lastRefillMs: 0 };
    clock.set(60_000); // way past — must clamp at 10
    const r = bucket.refill(state);
    expect(r.tokens).toBe(10);
  });

  it('denies when empty and reports retryAfterMs', () => {
    const state: BucketState = { tokens: 0, lastRefillMs: clock.now() };
    const d = bucket.consume(state, 4);
    expect(d.allowed).toBe(false);
    // 4 tokens at 2/s → 2000ms.
    expect(d.retryAfterMs).toBe(2000);
    // Denial doesn't consume — state is refilled but undiminished.
    expect(d.state.tokens).toBe(0);
  });

  it('fractional refill: half-token rates accumulate', () => {
    const b = new TokenBucket({ capacity: 5, refillRatePerSec: 0.5, clock });
    const state: BucketState = { tokens: 0, lastRefillMs: 0 };
    clock.set(1000); // 1s → 0.5 tokens — not enough
    expect(b.consume(state, 1).allowed).toBe(false);
    clock.set(3000); // 3s → 1.5 tokens — enough
    const d = b.consume(state, 1);
    expect(d.allowed).toBe(true);
    expect(d.state.tokens).toBe(0.5);
  });

  it('is distributed-friendly: identical state+clock → identical decisions', () => {
    const b2 = new TokenBucket({ capacity: 10, refillRatePerSec: 2, clock });
    const state: BucketState = { tokens: 4, lastRefillMs: 0 };
    clock.set(2000);
    const d1 = bucket.consume(state, 1);
    const d2 = b2.consume(state, 1);
    expect(d1).toEqual(d2);
  });

  it('inMemory helper persists state per key', () => {
    const { hit } = TokenBucket.inMemory({
      capacity: 2,
      refillRatePerSec: 0.0001, // ~no refill inside the test
      clock,
    });
    expect(hit('k').allowed).toBe(true);
    expect(hit('k').allowed).toBe(true);
    expect(hit('k').allowed).toBe(false); // empty — no refill
    expect(hit('other').allowed).toBe(true); // independent key
  });
});

/* ------------------------------------------------------------------ */
/* LimitHeaders                                                        */
/* ------------------------------------------------------------------ */

describe('LimitHeaders', () => {
  it('computes X-RateLimit-* in seconds', () => {
    const h = LimitHeaders.compute({
      limit: 100,
      remaining: 37,
      resetAtMs: 1_700_000_001_500, // ms — must become seconds
    });
    expect(h['X-RateLimit-Limit']).toBe('100');
    expect(h['X-RateLimit-Remaining']).toBe('37');
    expect(h['X-RateLimit-Reset']).toBe('1700000002'); // ceil to seconds
    expect(h['Retry-After']).toBeUndefined();
  });

  it('adds Retry-After when denied', () => {
    const h = LimitHeaders.compute({
      limit: 10,
      remaining: 0,
      resetAtMs: 1_700_000_010_000,
      retryAfterMs: 5500,
    });
    expect(h['Retry-After']).toBe('6'); // ceil 5.5s → 6
  });

  it('clamps remaining at zero', () => {
    const h = LimitHeaders.compute({ limit: 10, remaining: -3, resetAtMs: 0 });
    expect(h['X-RateLimit-Remaining']).toBe('0');
  });

  it('draft headers use the IETF names', () => {
    const h = LimitHeaders.draftHeaders({
      limit: 5,
      remaining: 4,
      resetAtMs: 1000,
    });
    expect(h['RateLimit-Limit']).toBe('5');
    expect(h['RateLimit-Remaining']).toBe('4');
    expect(h['RateLimit-Reset']).toBe('1');
  });

  it('all() merges both header sets', () => {
    const h = LimitHeaders.all({ limit: 1, remaining: 0, resetAtMs: 1000 });
    expect(h['X-RateLimit-Limit']).toBe('1');
    expect(h['RateLimit-Limit']).toBe('1');
  });
});
