/**
 * Per-Middleware Duration Metrics
 *
 * Fixed-bucket histograms tracking middleware invocation durations,
 * plus counters for skips / failures / timeouts / short-circuits.
 *
 * Histogram design:
 * - Explicit ascending bucket boundaries (defaults mirror common
 *   Prometheus latency profiles: 1ms … 30s geometric-ish).
 * - `observe(v)` finds its bucket via binary search — O(log b).
 * - Counts are *cumulative* (Prometheus `le` convention): the exported
 *   `counts[i]` equals observations ≤ `buckets[i]`. Maintaining a raw
 *   bucket array then prefix-summing on snapshot keeps writes cheap
 *   and snapshots cheap.
 * - `+Inf` overflow bucket captures anything above the last boundary.
 *
 * Threading: single-threaded runtime assumed; counters are plain ints.
 *
 * @module MiddlewareLayer/Engine
 */

import {
  DurationHistogramSnapshot,
  MiddlewareInvocationRecord,
  MiddlewareMetricSnapshot,
} from './types';

/** Default bucket boundaries in milliseconds (log-linear). */
export const DEFAULT_LATENCY_BUCKETS: readonly number[] = Object.freeze([
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000,
]);

/**
 * Fixed-bucket duration histogram for one instrumented middleware.
 *
 * Writes: O(log b) via binary search over a b-element boundary array.
 * Reads:  O(b) to produce the cumulative snapshot.
 */
export class DurationHistogram {
  private readonly _boundaries: readonly number[];
  private readonly _raw: number[];
  private _overflow: number;
  private _count: number;
  private _sum: number;
  private _min: number;
  private _max: number;

  constructor(boundaries: readonly number[] = DEFAULT_LATENCY_BUCKETS) {
    if (boundaries.length === 0) {
      throw new Error('Histogram requires at least one bucket boundary');
    }
    for (let i = 1; i < boundaries.length; i++) {
      if (boundaries[i] <= boundaries[i - 1]) {
        throw new Error('Histogram boundaries must be strictly ascending');
      }
    }
    this._boundaries = boundaries;
    this._raw = new Array<number>(boundaries.length).fill(0);
    this._overflow = 0;
    this._count = 0;
    this._sum = 0;
    this._min = Number.POSITIVE_INFINITY;
    this._max = Number.NEGATIVE_INFINITY;
  }

  /**
   * Record one observation. Negative values are clamped to zero —
   * clock skew must not corrupt buckets.
   */
  observe(value: number): void {
    const v = Math.max(0, value);
    const idx = this._lowerBound(v);
    if (idx < this._boundaries.length) {
      this._raw[idx]++;
    } else {
      this._overflow++;
    }
    this._count++;
    this._sum += v;
    if (v < this._min) {
      this._min = v;
    }
    if (v > this._max) {
      this._max = v;
    }
  }

  /**
   * Produce a cumulative-count snapshot. After normalization:
   * `snapshot.counts[i] = observations ≤ snapshot.buckets[i]`.
   */
  snapshot(): DurationHistogramSnapshot {
    const counts = new Array<number>(this._boundaries.length);
    let cumulative = 0;
    for (let i = 0; i < this._raw.length; i++) {
      cumulative += this._raw[i];
      counts[i] = cumulative;
    }
    return {
      buckets: [...this._boundaries],
      counts,
      overflow: this._overflow,
      count: this._count,
      sum: this._sum,
      min: this._count === 0 ? 0 : this._min,
      max: this._count === 0 ? 0 : this._max,
    };
  }

  /**
   * Estimate a percentile in [0, 100] via linear interpolation inside
   * the owning bucket. Cheap, slightly optimistic — fine for health
   * reporting and SLO dashboards.
   */
  percentile(p: number): number {
    if (this._count === 0) {
      return 0;
    }
    const snap = this.snapshot();
    const target = (p / 100) * snap.count;

    let prevCount = 0;
    let prevBound = 0;
    for (let i = 0; i < snap.buckets.length; i++) {
      const bound = snap.buckets[i];
      const cum = snap.counts[i];
      if (target <= cum) {
        const inBucket = target - prevCount;
        const width = bound - prevBound;
        const bucketCount = cum - prevCount;
        if (bucketCount === 0) {
          return bound;
        }
        return prevBound + width * (inBucket / bucketCount);
      }
      prevCount = cum;
      prevBound = bound;
    }
    // Everything above the last bucket: report the max.
    return snap.max;
  }

  /** Reset all counters and buckets. */
  reset(): void {
    this._raw.fill(0);
    this._overflow = 0;
    this._count = 0;
    this._sum = 0;
    this._min = Number.POSITIVE_INFINITY;
    this._max = Number.NEGATIVE_INFINITY;
  }

  /**
   * Index of the first boundary ≥ value (lower_bound). O(log b).
   */
  private _lowerBound(value: number): number {
    let lo = 0;
    let hi = this._boundaries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._boundaries[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }
}

/**
 * Per-middleware counters + duration histogram pair.
 */
class MiddlewareMetricEntry {
  readonly histogram: DurationHistogram;
  invocations: number;
  skips: number;
  failures: number;
  timeouts: number;
  shortCircuits: number;

  constructor(boundaries: readonly number[]) {
    this.histogram = new DurationHistogram(boundaries);
    this.invocations = 0;
    this.skips = 0;
    this.failures = 0;
    this.timeouts = 0;
    this.shortCircuits = 0;
  }
}

/**
 * Collector aggregating invocation records into per-middleware metrics.
 *
 * Feed it every {@link MiddlewareInvocationRecord} the composition
 * engine emits; query with `snapshot()` / `snapshotFor(name)`.
 */
export class MiddlewareMetricsCollector {
  private readonly _boundaries: readonly number[];
  private readonly _entries: Map<string, MiddlewareMetricEntry>;

  constructor(boundaries: readonly number[] = DEFAULT_LATENCY_BUCKETS) {
    this._boundaries = boundaries;
    this._entries = new Map();
  }

  /**
   * Fold one invocation record into metrics. Executed middleware
   * contribute duration samples; skipped ones only bump `skips`.
   */
  record(record: MiddlewareInvocationRecord): void {
    const entry = this._entryFor(record.name);
    if (!record.executed) {
      entry.skips++;
      return;
    }
    entry.invocations++;
    entry.histogram.observe(record.durationMs);
    if (record.timedOut) {
      entry.timeouts++;
    }
    if (record.failed) {
      entry.failures++;
    }
    if (!record.calledNext) {
      entry.shortCircuits++;
    }
  }

  /**
   * Fold an entire execution report's invocation list.
   */
  recordAll(records: readonly MiddlewareInvocationRecord[]): void {
    for (const record of records) {
      this.record(record);
    }
  }

  /**
   * Snapshot for one middleware, or `undefined` when unknown.
   */
  snapshotFor(name: string): MiddlewareMetricSnapshot | undefined {
    const entry = this._entries.get(name);
    if (entry === undefined) {
      return undefined;
    }
    return {
      name,
      invocations: entry.invocations,
      skips: entry.skips,
      failures: entry.failures,
      timeouts: entry.timeouts,
      shortCircuits: entry.shortCircuits,
      duration: entry.histogram.snapshot(),
    };
  }

  /**
   * Snapshots for all instrumented middleware, sorted by name.
   */
  snapshot(): MiddlewareMetricSnapshot[] {
    const names = [...this._entries.keys()].sort();
    const out: MiddlewareMetricSnapshot[] = [];
    for (const name of names) {
      const snap = this.snapshotFor(name);
      if (snap !== undefined) {
        out.push(snap);
      }
    }
    return out;
  }

  /**
   * Estimated latency percentile for a middleware (0 if unknown/empty).
   */
  percentileFor(name: string, p: number): number {
    const entry = this._entries.get(name);
    if (entry === undefined) {
      return 0;
    }
    return entry.histogram.percentile(p);
  }

  /** All known middleware names. */
  names(): string[] {
    return [...this._entries.keys()].sort();
  }

  /** Reset all metrics. */
  reset(): void {
    this._entries.clear();
  }

  private _entryFor(name: string): MiddlewareMetricEntry {
    let entry = this._entries.get(name);
    if (entry === undefined) {
      entry = new MiddlewareMetricEntry(this._boundaries);
      this._entries.set(name, entry);
    }
    return entry;
  }
}
