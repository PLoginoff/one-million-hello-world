/**
 * ThroughputTracker — sliding-window processing metrics.
 *
 * Maintains a ring of per-second buckets (default 60s) tracking
 * processed/failed/parked counts and handler latency samples, giving
 * real-time rates without storing every event.
 *
 *   recordProcessed(latencyMs), recordFailure(), recordParked()
 *   rates(now) -> per-second averages over the live window
 *   latencyPercentile(p) -> t-digest-lite: percentiles over a bounded
 *                          reservoir (last N samples, sorted on query)
 *
 * Reservoir sampling: keep up to `reservoirSize` latency samples via
 * Algorithm R (uniform random replacement) so percentiles stay
 * representative under sustained load without unbounded memory.
 *
 * @module Inbox/Pattern
 */

export interface ThroughputRates {
  processedPerSec: number;
  failedPerSec: number;
  parkedPerSec: number;
  /** Active window seconds (<= windowSeconds). */
  windowSeconds: number;
  totalProcessed: number;
  totalFailed: number;
  totalParked: number;
  p50: number;
  p95: number;
  p99: number;
}

interface Bucket {
  sec: number;
  processed: number;
  failed: number;
  parked: number;
}

export class ThroughputTracker {
  private readonly _windowSeconds: number;
  private readonly _buckets: Map<number, Bucket> = new Map();
  private readonly _reservoir: number[] = [];
  private readonly _reservoirSize: number;
  private readonly _rng: () => number;
  private _seen = 0;
  private _totals = { processed: 0, failed: 0, parked: 0 };

  constructor(windowSeconds = 60, reservoirSize = 1_000, rng: () => number = Math.random) {
    this._windowSeconds = windowSeconds;
    this._reservoirSize = reservoirSize;
    this._rng = rng;
  }

  private _bucket(sec: number): Bucket {
    let b = this._buckets.get(sec);
    if (!b) {
      b = { sec, processed: 0, failed: 0, parked: 0 };
      this._buckets.set(sec, b);
      // Evict stale buckets lazily
      for (const k of [...this._buckets.keys()]) {
        if (k < sec - this._windowSeconds) this._buckets.delete(k);
      }
    }
    return b;
  }

  recordProcessed(latencyMs: number, now: number = Date.now()): void {
    this._bucket(Math.floor(now / 1000)).processed++;
    this._totals.processed++;
    this._sample(latencyMs);
  }

  recordFailure(now: number = Date.now()): void {
    this._bucket(Math.floor(now / 1000)).failed++;
    this._totals.failed++;
  }

  recordParked(now: number = Date.now()): void {
    this._bucket(Math.floor(now / 1000)).parked++;
    this._totals.parked++;
  }

  /** Reservoir sampling (Algorithm R): uniform sample of all seen latencies. */
  private _sample(v: number): void {
    this._seen++;
    if (this._reservoir.length < this._reservoirSize) {
      this._reservoir.push(v);
    } else {
      const i = Math.floor(this._rng() * this._seen);
      if (i < this._reservoirSize) this._reservoir[i] = v;
    }
  }

  private _percentile(p: number): number {
    if (this._reservoir.length === 0) return 0;
    const sorted = [...this._reservoir].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
  }

  /** Per-second rates over the live window + latency percentiles. */
  rates(now: number = Date.now()): ThroughputRates {
    const nowSec = Math.floor(now / 1000);
    let p = 0, f = 0, k = 0;
    let oldest = nowSec;
    for (const b of this._buckets.values()) {
      if (b.sec > nowSec - this._windowSeconds) {
        p += b.processed;
        f += b.failed;
        k += b.parked;
        if (b.sec < oldest) oldest = b.sec;
      }
    }
    const span = Math.max(1, Math.min(this._windowSeconds, nowSec - oldest + 1));
    return {
      processedPerSec: p / span,
      failedPerSec: f / span,
      parkedPerSec: k / span,
      windowSeconds: span,
      totalProcessed: this._totals.processed,
      totalFailed: this._totals.failed,
      totalParked: this._totals.parked,
      p50: this._percentile(50),
      p95: this._percentile(95),
      p99: this._percentile(99),
    };
  }
}
