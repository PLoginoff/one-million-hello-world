/**
 * Token Bucket Rate Limiter
 *
 * Per-key token buckets with continuous refill, implemented lazily:
 * no timers — each `consume()` call refills the bucket based on
 * elapsed time since the last touch.
 *
 * Complexity: O(1) per check, O(K) memory for K active keys.
 * A periodic `sweep()` removes idle buckets to bound memory.
 *
 * @module ApiGatewayLayer/Engine
 */

import {
  GatewayClock,
  SystemGatewayClock,
  RateLimitPolicy,
  RateLimitDecision,
} from './types';

interface Bucket {
  /** Current tokens (fractional allowed). */
  tokens: number;
  /** Last refill timestamp (ms). */
  lastRefillMs: number;
  /** Policy snapshot for this bucket. */
  policy: RateLimitPolicy;
}

/**
 * Token-bucket rate limiter.
 *
 * `consume(key, policy)` checks a bucket named `key`, refilling it
 * with `elapsed * refillPerSecond / 1000` tokens capped at
 * `burstCapacity`, then spends one token if available.
 */
export class TokenBucketRateLimiter {
  private _buckets: Map<string, Bucket>;
  private _clock: GatewayClock;

  constructor(clock?: GatewayClock) {
    this._buckets = new Map();
    this._clock = clock ?? new SystemGatewayClock();
  }

  /**
   * Attempt to consume one token for `key` under `policy`.
   * The policy may differ per caller; the newest policy wins so
   * configuration changes take effect immediately.
   */
  consume(key: string, policy: RateLimitPolicy, source: 'route' | 'consumer' = 'route'): RateLimitDecision {
    const now = this._clock.now();
    let bucket = this._buckets.get(key);
    if (!bucket) {
      bucket = { tokens: policy.burstCapacity, lastRefillMs: now, policy };
      this._buckets.set(key, bucket);
    }

    // Lazy refill
    const elapsedSec = (now - bucket.lastRefillMs) / 1000;
    if (elapsedSec > 0) {
      bucket.tokens = Math.min(
        bucket.policy.burstCapacity,
        bucket.tokens + elapsedSec * bucket.policy.refillPerSecond
      );
      bucket.lastRefillMs = now;
    }
    bucket.policy = policy;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, remainingTokens: Math.floor(bucket.tokens), source };
    }

    const deficit = 1 - bucket.tokens;
    const retryAfterSeconds = Math.ceil(deficit / bucket.policy.refillPerSecond);
    return {
      allowed: false,
      remainingTokens: 0,
      retryAfterSeconds: policy.emitRetryAfter ? retryAfterSeconds : undefined,
      source,
    };
  }

  /** Peek remaining tokens without consuming. */
  peek(key: string): number | undefined {
    const bucket = this._buckets.get(key);
    return bucket ? Math.floor(bucket.tokens) : undefined;
  }

  /** Reset a key's bucket to full. */
  reset(key: string, policy?: RateLimitPolicy): void {
    const bucket = this._buckets.get(key);
    if (bucket) {
      bucket.tokens = (policy ?? bucket.policy).burstCapacity;
      bucket.lastRefillMs = this._clock.now();
      if (policy) bucket.policy = policy;
    }
  }

  /** Remove a bucket entirely. */
  clear(key: string): boolean {
    return this._buckets.delete(key);
  }

  /**
   * Remove buckets that have been idle longer than `idleMs`.
   * A full, untouched bucket wastes memory; sweep it. O(K).
   */
  sweep(idleMs: number): number {
    const now = this._clock.now();
    let removed = 0;
    for (const [key, bucket] of [...this._buckets]) {
      // Compute what the balance WOULD be after lazy refill —
      // without touching lastRefillMs, which measures idleness.
      const elapsedSec = (now - bucket.lastRefillMs) / 1000;
      const wouldBe = Math.min(
        bucket.policy.burstCapacity,
        bucket.tokens + elapsedSec * bucket.policy.refillPerSecond
      );
      if (now - bucket.lastRefillMs > idleMs && wouldBe >= bucket.policy.burstCapacity) {
        this._buckets.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Number of live buckets. */
  size(): number {
    return this._buckets.size;
  }
}
