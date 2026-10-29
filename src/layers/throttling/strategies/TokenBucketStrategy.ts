/**
 * Token bucket — throughput throttling with burst allowance.
 *
 * Classic token bucket: tokens accumulate at `ratePerSec` up to `capacity`
 * (the burst ceiling). Each admitted request consumes `cost` tokens
 * (default 1). Two modes:
 *
 *  - `tryAcquire` — non-blocking: true if a token was available.
 *  - `acquire` — blocking: waits until the bucket refills enough. Computed
 *    wait time is scheduled via the injected {@link TimerSource}; callers
 *    can bound the wait with `maxWaitMs` (reject rather than queue
 *     indefinitely).
 *
 * Refill is lazy — tokens are materialized on demand from elapsed time,
 * not by a background interval (O(1) per call, no timer churn).
 *
 * @module Throttling/Strategies
 */

import {
  ThrottleMetrics,
  ThrottleRejectedError,
  TimerSource,
  SystemTimerSource,
  emptyMetrics,
} from '../domain/throttle-model';

export interface TokenBucketOptions {
  /** Token refill rate per second. */
  readonly ratePerSec: number;
  /** Bucket capacity — max burst size. */
  readonly capacity: number;
  /** Start full (default) or empty. */
  readonly initialTokens?: number;
  /** Max milliseconds `acquire` will wait for tokens; 0 = unbounded. */
  readonly maxWaitMs?: number;
  readonly timer?: TimerSource;
}

export class TokenBucketStrategy {
  readonly name = 'token-bucket';

  private readonly _ratePerSec: number;
  private readonly _capacity: number;
  private readonly _maxWaitMs: number;
  private readonly _timer: TimerSource;
  private _tokens: number;
  private _lastRefillAt: number;
  private readonly _metrics: ThrottleMetrics = emptyMetrics();
  /** Pending single-acquire waiters — drained FIFO as tokens arrive. */
  private readonly _waiters: { needed: number; resolve(): void; reject(e: Error): void }[] = [];

  constructor(options: TokenBucketOptions) {
    if (options.ratePerSec <= 0 || options.capacity <= 0) {
      throw new Error('ratePerSec and capacity must be > 0');
    }
    this._ratePerSec = options.ratePerSec;
    this._capacity = options.capacity;
    this._maxWaitMs = options.maxWaitMs ?? 0;
    this._timer = options.timer ?? new SystemTimerSource();
    this._tokens = Math.min(options.initialTokens ?? options.capacity, options.capacity);
    this._lastRefillAt = this._timer.now();
  }

  /** Tokens currently available (after lazy refill). */
  get available(): number {
    this._refill();
    return this._tokens;
  }

  metrics(): ThrottleMetrics {
    return { ...this._metrics, queueDepth: this._waiters.length };
  }

  /** Non-blocking: consume `cost` tokens if available. */
  tryAcquire(cost = 1): boolean {
    this._refill();
    if (this._tokens >= cost) {
      this._tokens -= cost;
      this._metrics.admitted++;
      return true;
    }
    this._metrics.rejected++;
    return false;
  }

  /**
   * Blocking acquire: waits until `cost` tokens are available. The wait is
   * computed as `(cost - tokens) / rate` and re-checked on wake (another
   * caller may have consumed tokens first — waiters re-queue behind any
   * earlier waiter, preserving FIFO).
   */
  async acquire(cost = 1): Promise<void> {
    if (cost > this._capacity) {
      this._metrics.rejected++;
      throw new ThrottleRejectedError(`cost ${cost} exceeds bucket capacity ${this._capacity}`, 'at-capacity');
    }
    this._refill();
    if (this._tokens >= cost && this._waiters.length === 0) {
      this._tokens -= cost;
      this._metrics.admitted++;
      return;
    }
    if (this._maxWaitMs > 0) {
      const waitMs = this._waitTimeMs(cost);
      if (waitMs > this._maxWaitMs) {
        this._metrics.rejected++;
        throw new ThrottleRejectedError(`acquire would wait ${waitMs}ms > maxWaitMs`, 'timeout');
      }
    }
    this._metrics.queued++;
    return new Promise<void>((resolve, reject) => {
      this._waiters.push({ needed: cost, resolve, reject });
      this._armWaiters();
    });
  }

  /** Estimate ms until `cost` tokens are available. */
  private _waitTimeMs(cost: number): number {
    this._refill();
    const deficit = cost - this._tokens;
    if (deficit <= 0) {
      return 0;
    }
    return (deficit / this._ratePerSec) * 1000;
  }

  /**
   * Schedules a wake at the next time the bucket could satisfy the head
   * waiter. Waiters behind the head are only reconsidered when the head
   * resolves — strict FIFO prevents token theft.
   */
  private _armWaiters(): void {
    if (this._waiters.length === 0) {
      return;
    }
    const head = this._waiters[0];
    const waitMs = Math.max(0, this._waitTimeMs(head.needed));
    this._timer.schedule(waitMs, () => {
      this._refill();
      if (this._waiters.length === 0) {
        return;
      }
      const w = this._waiters[0];
      if (this._tokens >= w.needed) {
        this._waiters.shift();
        this._tokens -= w.needed;
        this._metrics.admitted++;
        this._metrics.dequeued++;
        w.resolve();
        // More waiters may now be satisfiable — keep draining.
        this._armWaiters();
      } else {
        // Refill estimate raced with other consumers — re-arm.
        this._armWaiters();
      }
    });
  }

  /** Lazy token accrual — tokens += rate * elapsed, capped at capacity. */
  private _refill(): void {
    const now = this._timer.now();
    const elapsedSec = (now - this._lastRefillAt) / 1000;
    if (elapsedSec > 0) {
      this._tokens = Math.min(this._capacity, this._tokens + elapsedSec * this._ratePerSec);
      this._lastRefillAt = now;
    }
  }
}
