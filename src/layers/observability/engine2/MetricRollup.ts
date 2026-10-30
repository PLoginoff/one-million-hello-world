/**
 * Metric Rollup — raw samples → aligned minute/hour buckets.
 *
 * The engine's `MetricsEngine` accumulates *current* values per series;
 * this module answers the adjacent question: "what did the series look
 * like over time at a coarser granularity?" — the classic
 * down-sampling job every metrics backend does before long-term storage.
 *
 * Data structure: `Map<seriesKey, Map<bucketStartMs, BucketAcc>>`.
 * Samples are bucketed by `floor(ts / bucketMs) * bucketMs`, so ingest
 * is O(1) per sample and `series()` is O(B · R) where B = buckets and
 * R = requested aggregates. Late/out-of-order samples are fine — the
 * bucket they land in is the truth regardless of arrival order.
 *
 * @module ObservabilityLayer/Engine2
 */

import { attributeKey } from '../engine/MetricsEngine';
import { Attributes } from '../engine/signals';
import {
  RawSample,
  RESOLUTION_MS,
  RollupAggregate,
  RollupPoint,
  RollupResolution,
} from './types';

/** Per-bucket accumulator — keeps enough state for every aggregate. */
interface BucketAcc {
  count: number;
  sum: number;
  min: number;
  max: number;
  /** First/last by *sample timestamp*, not arrival order. */
  firstMs: number;
  firstValue: number;
  lastMs: number;
  lastValue: number;
}

function newBucket(ts: number, value: number): BucketAcc {
  return {
    count: 1,
    sum: value,
    min: value,
    max: value,
    firstMs: ts,
    firstValue: value,
    lastMs: ts,
    lastValue: value,
  };
}

function fold(acc: BucketAcc, ts: number, value: number): void {
  acc.count += 1;
  acc.sum += value;
  if (value < acc.min) acc.min = value;
  if (value > acc.max) acc.max = value;
  if (ts < acc.firstMs) {
    acc.firstMs = ts;
    acc.firstValue = value;
  }
  if (ts >= acc.lastMs) {
    acc.lastMs = ts;
    acc.lastValue = value;
  }
}

/** Bucket start for a timestamp at a resolution. */
export function bucketStart(tsMs: number, resolution: RollupResolution): number {
  const m = RESOLUTION_MS[resolution];
  return Math.floor(tsMs / m) * m;
}

/**
 * In-memory rollup over one resolution. Create one `MetricRollup` per
 * granularity you need (typically a minute rollup feeding a derived
 * hour rollup, or two parallel instances).
 */
export class MetricRollup {
  readonly resolution: RollupResolution;
  private readonly _bucketMs: number;
  /** seriesKey → (bucketStart → accumulator). */
  private readonly _series = new Map<string, Map<number, BucketAcc>>();
  /** seriesKey → attribute map (for filtering/display). */
  private readonly _attrBySeries = new Map<string, Attributes>();
  private _samples = 0;

  constructor(resolution: RollupResolution = 'minute') {
    this.resolution = resolution;
    this._bucketMs = RESOLUTION_MS[resolution];
  }

  /**
   * Record one sample. `name` is folded into the series key so distinct
   * metric names never collide on identical attribute sets.
   */
  record(name: string, sample: RawSample): void {
    const key = `${name}|${attributeKey(sample.attributes)}`;
    const bs = bucketStart(sample.timestampMs, this.resolution);
    let buckets = this._series.get(key);
    if (!buckets) {
      buckets = new Map();
      this._series.set(key, buckets);
      this._attrBySeries.set(key, sample.attributes ?? {});
    }
    const acc = buckets.get(bs);
    if (acc) fold(acc, sample.timestampMs, sample.value);
    else buckets.set(bs, newBucket(sample.timestampMs, sample.value));
    this._samples += 1;
  }

  recordAll(name: string, samples: ReadonlyArray<RawSample>): void {
    for (const s of samples) this.record(name, s);
  }

  /**
   * Roll a finished minute-rollup up into this (coarser) rollup.
   * Bucket values are re-weighted by sample count so the coarse
   * aggregates stay exact rather than averaging averages.
   */
  absorbRollup(source: MetricRollup, aggregate: RollupAggregate): void {
    for (const [key, buckets] of source._series) {
      let mine = this._series.get(key);
      if (!mine) {
        mine = new Map();
        this._series.set(key, mine);
        this._attrBySeries.set(key, source._attrBySeries.get(key) ?? {});
      }
      for (const [bs, acc] of buckets) {
        const value = project(acc, aggregate, source._bucketMs);
        // Synthesize one pseudo-sample per source bucket, weighted by
        // its sample count, preserving first/last ordering by time.
        const pseudo: BucketAcc = {
          count: acc.count,
          sum: value * acc.count,
          min: value,
          max: value,
          firstMs: acc.firstMs,
          firstValue: value,
          lastMs: acc.lastMs,
          lastValue: value,
        };
        const targetBs = bucketStart(bs, this.resolution);
        const existing = mine.get(targetBs);
        if (!existing) {
          mine.set(targetBs, pseudo);
        } else {
          existing.count += pseudo.count;
          existing.sum += pseudo.sum;
          if (pseudo.min < existing.min) existing.min = pseudo.min;
          if (pseudo.max > existing.max) existing.max = pseudo.max;
          if (pseudo.firstMs < existing.firstMs) {
            existing.firstMs = pseudo.firstMs;
            existing.firstValue = pseudo.firstValue;
          }
          if (pseudo.lastMs >= existing.lastMs) {
            existing.lastMs = pseudo.lastMs;
            existing.lastValue = pseudo.lastValue;
          }
        }
      }
    }
  }

  /**
   * Materialize a rolled-up series.
   * Returns sorted `RollupPoint`s; empty buckets are skipped (sparse
   * series) unless `fillGaps` asks for zero-valued placeholders.
   */
  series(
    name: string,
    attributes: Attributes | undefined,
    aggregate: RollupAggregate = 'avg',
    opts: { fillGaps?: boolean; fromMs?: number; toMs?: number } = {},
  ): RollupPoint[] {
    const key = `${name}|${attributeKey(attributes)}`;
    const buckets = this._series.get(key);
    if (!buckets) return [];
    const out: RollupPoint[] = [];
    let minBs = Infinity;
    let maxBs = -Infinity;
    for (const [bs, acc] of buckets) {
      if (opts.fromMs !== undefined && bs < opts.fromMs) continue;
      if (opts.toMs !== undefined && bs >= opts.toMs) continue;
      minBs = Math.min(minBs, bs);
      maxBs = Math.max(maxBs, bs);
      out.push({
        bucketStartMs: bs,
        resolution: this.resolution,
        value: project(acc, aggregate, this._bucketMs),
        sampleCount: acc.count,
        firstMs: acc.firstMs,
        lastMs: acc.lastMs,
      });
    }
    out.sort((a, b) => a.bucketStartMs - b.bucketStartMs);
    if (opts.fillGaps && out.length > 0) {
      const filled: RollupPoint[] = [];
      let cursor = out[0].bucketStartMs;
      const byBs = new Map(out.map((p) => [p.bucketStartMs, p]));
      while (cursor <= maxBs) {
        const p = byBs.get(cursor);
        filled.push(
          p ?? {
            bucketStartMs: cursor,
            resolution: this.resolution,
            value: 0,
            sampleCount: 0,
            firstMs: cursor,
            lastMs: cursor,
          },
        );
        cursor += this._bucketMs;
      }
      return filled;
    }
    return out;
  }

  /** All known series keys (name|attrs form). */
  seriesKeys(): string[] {
    return [...this._series.keys()];
  }

  /** Drop buckets older than `olderThanMs` — retention management. */
  prune(olderThanMs: number): number {
    let removed = 0;
    for (const [key, buckets] of this._series) {
      for (const bs of buckets.keys()) {
        if (bs + this._bucketMs <= olderThanMs) {
          buckets.delete(bs);
          removed += 1;
        }
      }
      if (buckets.size === 0) {
        this._series.delete(key);
        this._attrBySeries.delete(key);
      }
    }
    return removed;
  }

  stats(): { series: number; buckets: number; samples: number } {
    let buckets = 0;
    for (const b of this._series.values()) buckets += b.size;
    return { series: this._series.size, buckets, samples: this._samples };
  }
}

/**
 * Project a bucket accumulator into the requested aggregate.
 *
 * `rate` is per-second over the bucket's own span (last-first); a
 * single-sample bucket reports rate over the full bucket width —
 * the honest lower bound rather than NaN.
 */
function project(acc: BucketAcc, aggregate: RollupAggregate, bucketMs: number): number {
  switch (aggregate) {
    case 'avg':
      return acc.count === 0 ? 0 : acc.sum / acc.count;
    case 'min':
      return acc.min;
    case 'max':
      return acc.max;
    case 'sum':
      return acc.sum;
    case 'last':
      return acc.lastValue;
    case 'count':
      return acc.count;
    case 'rate': {
      const spanMs = Math.max(acc.lastMs - acc.firstMs, bucketMs);
      return (acc.sum / spanMs) * 1000;
    }
  }
}
