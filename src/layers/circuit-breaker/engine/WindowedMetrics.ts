/**
 * WindowedMetrics — rolling-window counters for breaker decisions.
 *
 * Counting failures "since last state change" is fragile: one ancient
 * failure can keep a breaker permanently on the edge. Resilience4j-style
 * breakers instead count over a *rolling window* — either a time-based
 * sliding window (failures in the last N ms) or a call-count ring (last
 * N calls). This module provides both:
 *
 *   - `TimeWindow`: buckets of `windowMs / bucketCount` resolution;
 *     each call lands in a bucket by timestamp; `total()` sums the live
 *     buckets. Amortized O(1) per record (dead buckets are dropped
 *     lazily on read).
 *   - `CallWindow`: fixed-size ring of the last N call outcomes —
 *     the "last 100 calls had 7% failures" style measure used by
 *     Resilience4j's COUNT_BASED sliding window.
 *
 * Both expose `failureRate` and `slowCallRate` so a breaker can trip on
 * either errors or latency (a slow backend sheds load just like a dead
 * one — the "slow call" breaker pattern).
 *
 * @module CircuitBreakerLayer/Engine
 */

import { BreakerEngineClock, SystemEngineClock } from './types';

export interface CallOutcome {
  success: boolean;
  latencyMs: number;
}

interface WindowBucket {
  /** Bucket's period start (ms); `-1` = never used. */
  startMs: number;
  calls: number;
  failures: number;
  slow: number;
  latencySum: number;
}

/**
 * Time-bucketed sliding window: a ring of `bucketCount` cells indexed
 * by `floor(now / bucketMs) % bucketCount`. Two buckets collide only
 * when their starts are ≥ window apart — and by then the stale cell
 * is legitimately dead, so overwriting it is correct.
 */
export class TimeWindow {
  private readonly _clock: BreakerEngineClock;
  private readonly _windowMs: number;
  private readonly _bucketMs: number;
  private readonly _slowThreshold: number;
  private readonly _buckets: WindowBucket[];

  constructor(windowMs: number, bucketCount = 10, options: { clock?: BreakerEngineClock; slowCallThresholdMs?: number } = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._windowMs = Math.max(1, windowMs);
    const count = Math.max(1, bucketCount);
    this._bucketMs = Math.max(1, Math.floor(this._windowMs / count));
    this._slowThreshold = options.slowCallThresholdMs ?? Infinity;
    this._buckets = Array.from({ length: count }, () => ({ startMs: -1, calls: 0, failures: 0, slow: 0, latencySum: 0 }));
  }

  /** Record a call outcome. */
  record(outcome: CallOutcome): void {
    const now = this._clock.now();
    const b = this._bucketFor(now);
    b.calls++;
    if (!outcome.success) b.failures++;
    if (outcome.latencyMs >= this._slowThreshold) b.slow++;
    b.latencySum += outcome.latencyMs;
  }

  /** Live window totals (buckets inside the window only). */
  totals(): { calls: number; failures: number; slow: number; meanLatencyMs: number } {
    const now = this._clock.now();
    const cutoff = now - this._windowMs;
    let calls = 0;
    let failures = 0;
    let slow = 0;
    let latencySum = 0;
    for (const b of this._buckets) {
      if (b.startMs < 0 || b.startMs < cutoff) continue;
      calls += b.calls;
      failures += b.failures;
      slow += b.slow;
      latencySum += b.latencySum;
    }
    return { calls, failures, slow, meanLatencyMs: calls > 0 ? latencySum / calls : 0 };
  }

  failureRate(): number {
    const t = this.totals();
    return t.calls > 0 ? t.failures / t.calls : 0;
  }

  slowCallRate(): number {
    const t = this.totals();
    return t.calls > 0 ? t.slow / t.calls : 0;
  }

  /**
   * Find-or-reset the bucket covering `now`.
   * Index = (now/bucketMs) mod bucketCount — a perfect slot for the
   * period. A stale cell (old period) is reset on first touch; a cell
   * with a *newer* startMs means `now` is behind the clock (possible
   * under manual clocks) — we fold it into the current cell anyway.
   */
  private _bucketFor(now: number): WindowBucket {
    const period = Math.floor(now / this._bucketMs);
    const start = period * this._bucketMs;
    const idx = period % this._buckets.length;
    const b = this._buckets[idx];
    if (b.startMs !== start) {
      b.startMs = start;
      b.calls = 0;
      b.failures = 0;
      b.slow = 0;
      b.latencySum = 0;
    }
    return b;
  }
}

/** Fixed-size ring of the last N call outcomes (count-based window). */
export class CallWindow {
  private readonly _capacity: number;
  private readonly _slowThreshold: number;
  private _ring: CallOutcome[];
  private _idx = 0;
  private _size = 0;
  private _failures = 0;
  private _slow = 0;
  private _latencySum = 0;

  constructor(capacity: number, slowCallThresholdMs = Infinity) {
    this._capacity = Math.max(1, capacity);
    this._slowThreshold = slowCallThresholdMs;
    this._ring = new Array(this._capacity);
  }

  record(outcome: CallOutcome): void {
    // Evict the overwritten cell's contribution first.
    const old = this._ring[this._idx] as CallOutcome | undefined;
    if (old !== undefined) {
      if (!old.success) this._failures--;
      if (old.latencyMs >= this._slowThreshold) this._slow--;
      this._latencySum -= old.latencyMs;
    } else {
      this._size++;
    }
    this._ring[this._idx] = outcome;
    if (!outcome.success) this._failures++;
    if (outcome.latencyMs >= this._slowThreshold) this._slow++;
    this._latencySum += outcome.latencyMs;
    this._idx = (this._idx + 1) % this._capacity;
  }

  get calls(): number {
    return this._size;
  }

  get failures(): number {
    return this._failures;
  }

  failureRate(): number {
    return this._size > 0 ? this._failures / this._size : 0;
  }

  slowCallRate(): number {
    return this._size > 0 ? this._slow / this._size : 0;
  }

  meanLatencyMs(): number {
    return this._size > 0 ? this._latencySum / this._size : 0;
  }

  /** Latest outcomes in arrival order (oldest first). */
  recent(n: number): CallOutcome[] {
    const count = Math.min(n, this._size);
    const out: CallOutcome[] = [];
    for (let i = 0; i < count; i++) {
      const idx = (this._idx - count + i + this._capacity) % this._capacity;
      out.push(this._ring[idx]);
    }
    return out;
  }

  reset(): void {
    this._ring = new Array(this._capacity);
    this._idx = 0;
    this._size = 0;
    this._failures = 0;
    this._slow = 0;
    this._latencySum = 0;
  }
}
