/**
 * SlidingWindowLog — exact sliding-window rate limiter with
 * sorted-set semantics.
 *
 * Unlike the counter approximation (`SlidingWindowStrategy` — two
 * fixed counters weighted by overlap), this keeps *every* request
 * timestamp inside the window, so the count is exact at every
 * instant rather than interpolated between bucket boundaries. Cost:
 * O(window-entries) memory per key vs O(1) for counters — the
 * standard exactness/memory trade.
 *
 * Sorted-set model (the Redis `ZADD/ZREMRANGEBYSCORE/ZCARD` pattern,
 * in-memory): each key's log is an ordered array of timestamps.
 * Requests append at the tail (timestamps are monotonic), expiry
 * trims from the head — since the array is sorted, both ops are
 * amortized O(1)+trim, not O(n) scans.
 *
 * `maxLogSize` is the safety bound: a key can't grow unboundedly
 * even if a caller misconfigures a giant window; crossing it drops
 * the *oldest* entries (still conservative — the count stays high).
 *
 * Complexity: `hit` is O(trimmed) + O(1) append; `count` is O(1)
 * after a trim. Space O(active-window entries).
 *
 * @module RateLimitingLayer/Engine
 */

import {
  ManualRateLimitClock,
  RateLimitClock,
  SlidingWindowLogOptions,
  SystemRateLimitClock,
  WindowDecision,
} from './types';

export class SlidingWindowLog {
  private readonly _windowMs: number;
  private readonly _maxLogSize: number;
  private readonly _clock: RateLimitClock;

  /** key → sorted request timestamps. */
  private _logs: Map<string, number[]>;
  private _totalHits: number;
  private _totalDenied: number;

  constructor(options: SlidingWindowLogOptions) {
    if (options.windowMs <= 0) {
      throw new RangeError('windowMs must be > 0');
    }
    this._windowMs = options.windowMs;
    this._maxLogSize = options.maxLogSize ?? 0;
    this._clock = options.clock ?? new SystemRateLimitClock();
    this._logs = new Map();
    this._totalHits = 0;
    this._totalDenied = 0;
  }

  /* ---------------------------------------------------------------- */
  /* Core operation                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Record a request for `key` against `limit` and return the verdict.
   * When denied, the timestamp is NOT appended — denied requests
   * don't consume quota (standard rate-limiter semantics: a blocked
   * request shouldn't extend the block).
   */
  hit(key: string, limit: number): WindowDecision {
    const now = this._clock.now();
    const cutoff = now - this._windowMs;
    const log = this._getOrCreate(key);
    this._trim(log, cutoff);
    this._totalHits++;

    const count = log.length;
    if (count >= limit) {
      this._totalDenied++;
      // Retry when the oldest in-window request exits the window.
      const oldest = log[0];
      return {
        allowed: false,
        count,
        remaining: 0,
        retryAfterMs: Math.max(1, oldest + this._windowMs - now),
        resetInMs: this._resetIn(log, now),
      };
    }

    log.push(now);
    // Bound memory: drop the oldest if a misconfigured window grows
    // the log past the cap — still conservative (count stays high).
    if (this._maxLogSize > 0 && log.length > this._maxLogSize) {
      log.splice(0, log.length - this._maxLogSize);
    }
    return {
      allowed: true,
      count: log.length,
      remaining: Math.max(0, limit - log.length),
      retryAfterMs: 0,
      resetInMs: this._resetIn(log, now),
    };
  }

  /** Peek the current window count without recording a request. */
  count(key: string): number {
    const log = this._logs.get(key);
    if (!log) {
      return 0;
    }
    this._trim(log, this._clock.now() - this._windowMs);
    return log.length;
  }

  /** Remaining quota for `key` under `limit` (peek, no record). */
  remaining(key: string, limit: number): number {
    return Math.max(0, limit - this.count(key));
  }

  /**
   * Remove the most recent timestamp from `key`'s log — the rollback
   * operation `QuotaBuckets` needs when a composite check denies after
   * earlier dimensions consumed. Returns false when the log is empty.
   */
  unhit(key: string): boolean {
    const log = this._logs.get(key);
    if (!log || log.length === 0) {
      return false;
    }
    log.pop();
    return true;
  }

  /** Clear a key's log (administrative reset). */
  reset(key: string): void {
    this._logs.delete(key);
  }

  /**
   * Drop keys whose entire log expired — bounded O(keys) sweep;
   * drive on a timer for long-lived engines.
   */
  sweep(): number {
    const cutoff = this._clock.now() - this._windowMs;
    let removed = 0;
    for (const [k, log] of this._logs) {
      this._trim(log, cutoff);
      if (log.length === 0) {
        this._logs.delete(k);
        removed++;
      }
    }
    return removed;
  }

  get trackedKeys(): number {
    return this._logs.size;
  }

  get totalHits(): number {
    return this._totalHits;
  }

  get totalDenied(): number {
    return this._totalDenied;
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _getOrCreate(key: string): number[] {
    let log = this._logs.get(key);
    if (!log) {
      log = [];
      this._logs.set(key, log);
    }
    return log;
  }

  /**
   * Remove timestamps ≤ cutoff from the sorted log head. Since the
   * log is append-ordered (monotonic clock), expired entries are a
   * strict prefix — the trim is one `splice`, not a filter scan.
   */
  private _trim(log: number[], cutoff: number): void {
    let first = 0;
    while (first < log.length && log[first] <= cutoff) {
      first++;
    }
    if (first > 0) {
      log.splice(0, first);
    }
  }

  /** Ms until the log fully clears (the newest entry exits). */
  private _resetIn(log: number[], now: number): number {
    if (log.length === 0) {
      return 0;
    }
    return Math.max(0, log[log.length - 1] + this._windowMs - now);
  }
}
