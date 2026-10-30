/**
 * Seasonal Anomaly Scorer — robust per-series outlier scoring.
 *
 * Different job from the SIEM `AnomalyDetector` (which z-scores event
 * *counts*): this scores individual metric *values* against a robust
 * baseline using MAD (median absolute deviation) instead of mean/
 * stddev. MAD is insensitive to the outliers we're trying to detect —
 * a single spike doesn't inflate the baseline and mask the next one.
 *
 *   modified z-score = 0.6745 · (x − median) / MAD
 *
 * Seasonality: samples bucket per hour-of-week (168 slots) so "high"
 * traffic at 9am Monday isn't flagged relative to Sunday-night levels.
 * With `seasonal: false`, a single global bucket is used.
 *
 * @module ObservabilityLayer/Engine2
 */

import { attributeKey } from '../engine/MetricsEngine';
import { Attributes } from '../engine/signals';

const HOUR_MS = 3_600_000;
const WEEK_HOURS = 168;
/** Scale factor making MAD a consistent estimator of σ for normal data. */
const MAD_TO_SIGMA = 0.6745;

export interface AnomalyScore {
  readonly seriesKey: string;
  readonly value: number;
  readonly modifiedZ: number;
  /** |modifiedZ| >= threshold → anomalous. */
  readonly anomalous: boolean;
  readonly median: number;
  readonly mad: number;
  readonly samples: number;
  readonly seasonalBucket?: number;
}

export interface ScorerConfig {
  /** |modified z| threshold; ~3.5 is the classical MAD cut-off. */
  readonly threshold: number;
  /** Min samples before scoring activates (before that: not anomalous). */
  readonly minSamples: number;
  /** Weekly seasonality on/off. */
  readonly seasonal: boolean;
  /** Bounded window per bucket — oldest evicted past this. */
  readonly maxSamplesPerBucket: number;
}

export const DEFAULT_SCORER_CONFIG: ScorerConfig = {
  threshold: 3.5,
  minSamples: 30,
  seasonal: true,
  maxSamplesPerBucket: 500,
};

interface Bucket {
  values: number[];
  head: number;
}

export class SeasonalAnomalyScorer {
  private readonly _config: ScorerConfig;
  /** seriesKey → (hourOfWeek → bucket) or single key 0 when non-seasonal. */
  private readonly _series = new Map<string, Map<number, Bucket>>();

  constructor(config: Partial<ScorerConfig> = {}) {
    this._config = { ...DEFAULT_SCORER_CONFIG, ...config };
  }

  /**
   * Learn one sample into the baseline. Scoring uses the baseline as it
   * stood *before* this sample — call `score` first, `learn` second
   * (or use `ingest` which does both in that order).
   */
  learn(name: string, value: number, timestampMs: number, attributes?: Attributes): void {
    const key = `${name}|${attributeKey(attributes)}`;
    const slot = this._slot(timestampMs);
    let bySlot = this._series.get(key);
    if (!bySlot) {
      bySlot = new Map();
      this._series.set(key, bySlot);
    }
    let b = bySlot.get(slot);
    if (!b) {
      b = { values: [], head: 0 };
      bySlot.set(slot, b);
    }
    if (b.values.length - b.head >= this._config.maxSamplesPerBucket) {
      // At capacity: drop the oldest quarter to amortize reallocation.
      const drop = Math.max(1, this._config.maxSamplesPerBucket >> 2);
      b.values = b.values.slice(b.head + drop);
      b.head = 0;
    }
    b.values.push(value);
  }

  /** Score a value without learning it. */
  score(name: string, value: number, timestampMs: number, attributes?: Attributes): AnomalyScore {
    const key = `${name}|${attributeKey(attributes)}`;
    const slot = this._slot(timestampMs);
    const b = this._series.get(key)?.get(slot);
    const n = b ? b.values.length - b.head : 0;
    if (!b || n < this._config.minSamples) {
      return {
        seriesKey: key,
        value,
        modifiedZ: 0,
        anomalous: false,
        median: value,
        mad: 0,
        samples: n,
        seasonalBucket: this._config.seasonal ? slot : undefined,
      };
    }
    const vals = b.values.slice(b.head);
    const med = median(vals);
    const deviations = vals.map((v) => Math.abs(v - med));
    const mad = median(deviations);
    // MAD=0: half the values equal the median — any deviation is huge.
    const z = mad === 0 ? (value === med ? 0 : Infinity) : (MAD_TO_SIGMA * (value - med)) / mad;
    return {
      seriesKey: key,
      value,
      modifiedZ: z,
      anomalous: Math.abs(z) >= this._config.threshold,
      median: med,
      mad,
      samples: n,
      seasonalBucket: this._config.seasonal ? slot : undefined,
    };
  }

  /** score + learn in the correct order for streaming use. */
  ingest(name: string, value: number, timestampMs: number, attributes?: Attributes): AnomalyScore {
    const s = this.score(name, value, timestampMs, attributes);
    this.learn(name, value, timestampMs, attributes);
    return s;
  }

  private _slot(timestampMs: number): number {
    if (!this._config.seasonal) return 0;
    // Hour of week: epoch ms → hour index mod 168.
    return Math.floor(timestampMs / HOUR_MS) % WEEK_HOURS;
  }
}

/** Median of an unsorted array — O(n log n) via sort on a copy. */
export function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Cardinality Guard — bound the number of distinct series per metric.
 *
 * Unbounded label values (user ids, request ids) are the classic way a
 * metric pipeline OOMs. The guard tracks distinct attribute-set keys
 * per metric name; once `maxSeries` is reached, new combinations fold
 * into a synthetic `__overflow__` series rather than minting more.
 *
 * Decision data structure: Map<metric, Set<attrKey>> — O(1) admit.
 *
 * @module ObservabilityLayer/Engine2
 */
export class CardinalityGuard {
  private readonly _maxSeries: number;
  private readonly _seen = new Map<string, Set<string>>();
  private _overflowed = 0;

  constructor(maxSeries = 10_000) {
    this._maxSeries = maxSeries;
  }

  /**
   * Returns the attribute map to use (unchanged when admitted, or the
   * `{__cardinality__: 'overflow'}` sentinel when over budget).
   */
  admit(metric: string, attributes?: Attributes): Attributes {
    const key = attributeKey(attributes);
    let set = this._seen.get(metric);
    if (!set) {
      set = new Set();
      this._seen.set(metric, set);
    }
    if (set.has(key)) return attributes ?? {};
    if (set.size >= this._maxSeries) {
      this._overflowed += 1;
      return { __cardinality__: 'overflow' };
    }
    set.add(key);
    return attributes ?? {};
  }

  seriesCount(metric: string): number {
    return this._seen.get(metric)?.size ?? 0;
  }

  overflowedCount(): number {
    return this._overflowed;
  }
}
