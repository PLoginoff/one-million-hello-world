/**
 * Sliding-Window Aggregator
 *
 * Real-time dashboard backbone: keeps per-metric counters over a
 * sliding time window, heavy-hitter top-N lists for dimensions, and
 * generates sparkline series — all in bounded memory.
 *
 * Data structure: per metric, a ring of fixed-size buckets indexed by
 * `floor(timestamp / bucketMs) % bucketCount`. Old buckets are reused
 * after checking their absolute bucket index, so stale cells are reset
 * on touch rather than swept — insert is O(1), queries are
 * O(liveBuckets).
 *
 * Complexity:
 *  - record():        O(1) amortized (bucket touch + counter add)
 *  - aggregate():     O(B) where B = buckets per window
 *  - sparkline():     O(B)
 *  - topN():          O(D + N log D) where D = tracked dimensions
 *
 * @module AnalyticsLayer/Engine2
 */

import {
  AggregateKind,
  SlidingWindowOptions,
  Sparkline,
  SparklineBucket,
  TopNList,
  WindowAggregate,
  WindowPoint,
  AnalyticsClock2,
  SystemAnalyticsClock2,
} from './types';

/** Rolling per-bucket accumulators. */
interface Bucket {
  /** Absolute bucket index (floor(ts / bucketMs)); -1 = never used. */
  index: number;
  count: number;
  sum: number;
  min: number;
  max: number;
}

function emptyBucket(): Bucket {
  return { index: -1, count: 0, sum: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
}

/**
 * One metric's ring buffer of buckets. The ring has `slots` cells;
 * a timestamp maps to cell `absIndex % slots`. A cell is only valid
 * when its stored `index` equals the absolute index — otherwise it
 * held data for an older generation and is lazily reset.
 */
class MetricRing {
  readonly cells: Bucket[];
  /** Highest absolute bucket index ever written (-1 if none). */
  newestIndex = -1;
  /** Lowest absolute bucket index still valid (for pruning stats). */
  totalPoints = 0;

  constructor(readonly slots: number) {
    this.cells = new Array<Bucket>(slots);
    for (let i = 0; i < slots; i++) this.cells[i] = emptyBucket();
  }

  /** Return the bucket for absolute index, resetting stale cells. */
  at(absIndex: number): Bucket {
    const slot = absIndex % this.slots;
    const cell = this.cells[slot]!;
    if (cell.index !== absIndex) {
      cell.index = absIndex;
      cell.count = 0;
      cell.sum = 0;
      cell.min = Number.POSITIVE_INFINITY;
      cell.max = Number.NEGATIVE_INFINITY;
    }
    return cell;
  }

  /** Read-only access; returns undefined for stale/absent buckets. */
  peek(absIndex: number): Bucket | undefined {
    if (absIndex < 0) return undefined;
    const cell = this.cells[absIndex % this.slots]!;
    return cell.index === absIndex ? cell : undefined;
  }
}

/** Combine two buckets under the chosen aggregate kind. */
function combine(kind: AggregateKind, acc: number, b: Bucket): number {
  switch (kind) {
    case 'count':
      return acc + b.count;
    case 'sum':
    case 'avg':
      return acc + b.sum;
    case 'min':
      return b.count > 0 ? Math.min(acc, b.min) : acc;
    case 'max':
      return b.count > 0 ? Math.max(acc, b.max) : acc;
  }
}

function bucketValue(kind: AggregateKind, b: Bucket): number | null {
  if (b.count === 0) return null;
  switch (kind) {
    case 'count':
      return b.count;
    case 'sum':
      return b.sum;
    case 'avg':
      return b.sum / b.count;
    case 'min':
      return b.min;
    case 'max':
      return b.max;
  }
}

export class SlidingWindowAggregator {
  private readonly bucketMs: number;
  private readonly windowMs: number;
  private readonly slots: number;
  private readonly clock: AnalyticsClock2;
  private readonly maxDimensions: number;
  private readonly rings = new Map<string, MetricRing>();
  private readonly dimensions = new Map<string, Map<string, number>>();
  private dimensionTotals = new Map<string, number>();
  private dimensionTruncated = new Map<string, boolean>();

  constructor(options: SlidingWindowOptions) {
    if (options.bucketMs <= 0) throw new Error('bucketMs must be positive');
    if (options.windowMs < options.bucketMs) {
      throw new Error('windowMs must be >= bucketMs');
    }
    this.bucketMs = options.bucketMs;
    this.windowMs = options.windowMs;
    // +1 slot so the partially-filled current bucket never collides
    // with the oldest live bucket.
    this.slots = Math.ceil(options.windowMs / options.bucketMs) + 1;
    this.clock = options.clock ?? new SystemAnalyticsClock2();
    this.maxDimensions = options.maxDimensions ?? 512;
  }

  /** Record one point into a metric's ring. */
  record(point: WindowPoint): void {
    const ts = point.timestamp ?? this.clock.now();
    const absIndex = Math.floor(ts / this.bucketMs);
    let ring = this.rings.get(point.metric);
    if (!ring) {
      ring = new MetricRing(this.slots);
      this.rings.set(point.metric, ring);
    }
    const b = ring.at(absIndex);
    const v = point.value ?? 1;
    b.count++;
    b.sum += v;
    if (v < b.min) b.min = v;
    if (v > b.max) b.max = v;
    ring.totalPoints++;
    if (absIndex > ring.newestIndex) ring.newestIndex = absIndex;
  }

  /**
   * Record a hit for a dimension value (e.g. a URL) on a named list.
   * When the list exceeds `maxDimensions`, the lowest-count entries
   * are evicted — a bounded-memory approximation of heavy hitters
   * similar in spirit to Space-Saving (Metwally et al., 2005), but
   * deterministic: evictions remove the true minimum.
   */
  hit(list: string, key: string): void {
    let counters = this.dimensions.get(list);
    if (!counters) {
      counters = new Map();
      this.dimensions.set(list, counters);
      this.dimensionTotals.set(list, 0);
      this.dimensionTruncated.set(list, false);
    }
    const existing = counters.get(key);
    if (existing !== undefined) {
      counters.set(key, existing + 1);
    } else if (counters.size < this.maxDimensions) {
      counters.set(key, 1);
    } else {
      // List full: evict the minimum-count entry (ties break toward
      // the lexicographically largest key for determinism), then
      // admit the newcomer at 1 — a bounded-memory approximation of
      // heavy hitters in the spirit of Space-Saving (Metwally et
      // al., 2005).
      let minKey: string | undefined;
      let minCount = Number.POSITIVE_INFINITY;
      for (const [k, c] of counters) {
        if (c < minCount || (c === minCount && minKey !== undefined && k > minKey)) {
          minCount = c;
          minKey = k;
        }
      }
      if (minKey !== undefined) counters.delete(minKey);
      counters.set(key, 1);
      this.dimensionTruncated.set(list, true);
    }
    this.dimensionTotals.set(list, (this.dimensionTotals.get(list) ?? 0) + 1);
  }

  /**
   * Aggregate a metric over the live window ending at `end`
   * (default: now). The window is `[end - windowMs, end)`; points
   * older than that are excluded even if their bucket cells are
   * still resident.
   */
  aggregate(metric: string, kind: AggregateKind, end?: number): WindowAggregate {
    const windowEnd = end ?? this.clock.now();
    const windowStart = windowEnd - this.windowMs;
    const ring = this.rings.get(metric);
    let acc = kind === 'min' ? Number.POSITIVE_INFINITY : kind === 'max' ? Number.NEGATIVE_INFINITY : 0;
    let samples = 0;

    if (ring) {
      const firstIdx = Math.ceil(windowStart / this.bucketMs);
      const lastIdx = Math.floor((windowEnd - 1) / this.bucketMs);
      for (let i = firstIdx; i <= lastIdx; i++) {
        const b = ring.peek(i);
        if (!b) continue;
        // Boundary buckets may contain pre-window points; when a
        // bucket straddles the window edge we include it whole —
        // an accepted approximation of bucketized windows.
        acc = combine(kind, acc, b);
        samples += b.count;
      }
    }

    let value: number;
    if (kind === 'avg') {
      value = samples > 0 ? acc / samples : Number.NaN;
    } else if ((kind === 'min' || kind === 'max') && samples === 0) {
      value = Number.NaN;
    } else {
      value = acc;
    }
    return { metric, kind, samples, value, windowStart, windowEnd };
  }

  /**
   * Sparkline series for a metric: one aggregated value per bucket,
   * oldest first, ending at `end` (default: now). Empty buckets are
   * represented as `null` so charts can draw gaps.
   */
  sparkline(metric: string, kind: AggregateKind, bucketCount: number, end?: number): Sparkline {
    const windowEnd = end ?? this.clock.now();
    const lastIdx = Math.floor((windowEnd - 1) / this.bucketMs);
    const firstIdx = lastIdx - bucketCount + 1;
    const ring = this.rings.get(metric);
    const buckets: SparklineBucket[] = [];
    for (let i = firstIdx; i <= lastIdx; i++) {
      const b = ring?.peek(i);
      buckets.push({
        start: i * this.bucketMs,
        value: b ? bucketValue(kind, b) : null,
      });
    }
    return { metric, kind, bucketMs: this.bucketMs, buckets };
  }

  /**
   * Top-N heavy hitters on a named dimension list, sorted by count
   * descending then key ascending for stable ordering.
   */
  topN(list: string, n: number): TopNList {
    const counters = this.dimensions.get(list);
    const total = this.dimensionTotals.get(list) ?? 0;
    if (!counters || n <= 0) {
      return { entries: [], total, truncated: this.dimensionTruncated.get(list) ?? false };
    }
    const entries = [...counters.entries()]
      .map(([key, count]) => ({ key, count, share: total > 0 ? count / total : 0 }))
      .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .slice(0, n);
    return {
      entries,
      total,
      truncated: this.dimensionTruncated.get(list) ?? false,
    };
  }

  /** Names of all metrics with live data. */
  metrics(): string[] {
    return [...this.rings.keys()];
  }

  /**
   * Drop metric rings whose newest bucket is entirely outside the
   * window — frees memory for metrics that stopped reporting.
   * Returns the number of rings removed.
   */
  prune(now?: number): number {
    const t = now ?? this.clock.now();
    const cutoff = Math.floor((t - this.windowMs) / this.bucketMs);
    let removed = 0;
    for (const [name, ring] of this.rings) {
      if (ring.newestIndex < cutoff) {
        this.rings.delete(name);
        removed++;
      }
    }
    return removed;
  }

  /** Reset all state. Primarily for tests. */
  clear(): void {
    this.rings.clear();
    this.dimensions.clear();
    this.dimensionTotals.clear();
    this.dimensionTruncated.clear();
  }
}
