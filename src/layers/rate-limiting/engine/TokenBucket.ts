/**
 * TokenBucket — refill-timestamp token bucket shaped for distributed
 * consistency.
 *
 * The bucket's entire state is `{tokens, lastRefillMs}` — plain,
 * serializable data. Two nodes that load the same state and share a
 * clock reach the same decision without coordination: refill is
 * computed lazily from elapsed time, so the "shared nothing" version
 * of this algorithm needs no central refcounting and no locks.
 *
 * Refill math: `tokens += (now - lastRefill) / 1000 × ratePerSec`,
 * clamped to `capacity`. Keeping `lastRefill` as a timestamp (rather
 * than decrementing a countdown) means a node can restore state from
 * any store, apply the elapsed-time delta, and be correct — the
 * classic Redis `GET` + lazy-refill + `SET` pattern.
 *
 * `consume` takes `cost` tokens (default 1): denied decisions do NOT
 * consume — a rejected request doesn't drain the bucket (standard;
 * a drain-on-deny would let bursts permanently suppress the client).
 *
 * The state is returned in the decision — the caller persists it (to
 * Redis, a local Map, whatever). The bucket doesn't store anything
 * itself: `TokenBucket` is stateless, the caller owns the record.
 *
 * Complexity: O(1) per consume.
 *
 * @module RateLimitingLayer/Engine
 */

import {
  BucketState,
  RateLimitClock,
  SystemRateLimitClock,
  TokenBucketDecision,
  TokenBucketOptions,
} from './types';

export class TokenBucket {
  private readonly _capacity: number;
  private readonly _refillPerMs: number;
  private readonly _clock: RateLimitClock;

  constructor(options: TokenBucketOptions) {
    if (options.capacity <= 0) {
      throw new RangeError('capacity must be > 0');
    }
    if (options.refillRatePerSec <= 0) {
      throw new RangeError('refillRatePerSec must be > 0');
    }
    this._capacity = options.capacity;
    this._refillPerMs = options.refillRatePerSec / 1000;
    this._clock = options.clock ?? new SystemRateLimitClock();
  }

  /** Fresh bucket state: full at `now`. */
  initialState(): BucketState {
    return { tokens: this._capacity, lastRefillMs: this._clock.now() };
  }

  /**
   * Apply elapsed-time refill to a stored state. Pure function —
   * returns new state, doesn't touch anything.
   */
  refill(state: BucketState, nowMs?: number): BucketState {
    const now = nowMs ?? this._clock.now();
    const elapsed = Math.max(0, now - state.lastRefillMs);
    const gained = elapsed * this._refillPerMs;
    const tokens = Math.min(this._capacity, state.tokens + gained);
    return { tokens, lastRefillMs: now };
  }

  /**
   * Try to take `cost` tokens from `state` (default 1). Returns the
   * decision plus the new state to persist. Denial leaves the bucket
   * unchanged — the caller saves either way.
   */
  consume(state: BucketState, cost = 1): TokenBucketDecision {
    const now = this._clock.now();
    const refilled = this.refill(state, now);

    if (refilled.tokens >= cost) {
      const next: BucketState = {
        tokens: refilled.tokens - cost,
        lastRefillMs: refilled.lastRefillMs,
      };
      return {
        allowed: true,
        remaining: Math.floor(next.tokens),
        retryAfterMs: 0,
        state: next,
      };
    }

    // Denied: no consumption. Retry when enough tokens accrue.
    const deficit = cost - refilled.tokens;
    const waitMs = this._refillPerMs > 0 ? Math.ceil(deficit / this._refillPerMs) : Infinity;
    return {
      allowed: false,
      remaining: Math.floor(refilled.tokens),
      retryAfterMs: waitMs,
      state: refilled, // refilled but unconsumed — save this
    };
  }

  /**
   * Convenience store-backed variant: an in-memory Map the caller
   * owns. `hit(key, cost)` = load state → consume → store → report.
   */
  static inMemory(
    options: TokenBucketOptions
  ): { bucket: TokenBucket; hit: (key: string, cost?: number) => TokenBucketDecision } {
    const bucket = new TokenBucket(options);
    const states = new Map<string, BucketState>();
    return {
      bucket,
      hit(key: string, cost = 1): TokenBucketDecision {
        const state = states.get(key) ?? bucket.initialState();
        const d = bucket.consume(state, cost);
        states.set(key, d.state);
        return d;
      },
    };
  }

  get capacity(): number {
    return this._capacity;
  }

  get refillRatePerSec(): number {
    return this._refillPerMs * 1000;
  }
}
