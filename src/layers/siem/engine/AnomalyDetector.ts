/**
 * SIEM Anomaly Detection
 *
 * Baselines each (entity,action) pair's event rate in a sliding window
 * and flags anomalous bursts — e.g. a user who normally authenticates
 * 3×/hour suddenly firing 200 events. Uses a normal approximation on
 * per-window counts:
 *
 *   z = (count - μ) / σ     — flagged when z > threshold and count ≥ minCount
 *
 * Windows are kept in a bounded ring of recent buckets so μ and σ are
 * computed over the last `windowCount` buckets, not the whole history
 * (adaptivity + bounded memory).
 *
 * @module SiemLayer/Engine
 */

import { NormalizedEvent } from './EventNormalizer';
import { IClock, SystemClock } from '../../observability/engine/signals';

export interface AnomalyDetectorConfig {
  /** Bucket granularity (ms). Events are counted per bucket. */
  readonly bucketMs: number;
  /** Number of recent buckets forming the baseline. */
  readonly windowCount: number;
  /** Z-score threshold for flagging. */
  readonly zThreshold: number;
  /** Minimum absolute count — z-scores are meaningless on tiny samples. */
  readonly minCount: number;
}

const DEFAULTS: AnomalyDetectorConfig = {
  bucketMs: 60_000,
  windowCount: 60,
  zThreshold: 4,
  minCount: 10,
};

export interface Anomaly {
  readonly key: string;
  readonly bucketStartMs: number;
  readonly count: number;
  readonly mean: number;
  readonly stddev: number;
  readonly zScore: number;
  readonly sampleEvent: NormalizedEvent;
}

interface BucketRing {
  /** Ring buffer of counts for the last `windowCount` buckets. */
  counts: number[];
  /** Bucket index of the most recently written slot. */
  head: number;
  /** The epoch bucket index `head` corresponds to. */
  headEpoch: number;
  /** Cached aggregates — invalidated on write. */
  sum: number;
  sumSq: number;
}

/**
 * Per-key anomaly detection. Keys are derived from event fields via a
 * configurable `keyFn` — the default groups by (user ?? sourceIp, action).
 */
export class AnomalyDetector {
  private readonly _config: AnomalyDetectorConfig;
  private readonly _clock: IClock;
  private readonly _rings = new Map<string, BucketRing>();
  private readonly _keyFn: (e: NormalizedEvent) => string;

  constructor(
    config: Partial<AnomalyDetectorConfig> = {},
    clock: IClock = new SystemClock(),
    keyFn?: (e: NormalizedEvent) => string
  ) {
    this._config = { ...DEFAULTS, ...config };
    this._clock = clock;
    this._keyFn = keyFn ?? ((e) => `${e.user ?? e.sourceIp ?? '?'}|${e.action ?? '?'}`);
  }

  /**
   * Feed an event; returns an `Anomaly` if this event's bucket is a
   * statistical outlier, else `null`.
   */
  ingest(event: NormalizedEvent): Anomaly | null {
    const key = this._keyFn(event);
    const epoch = Math.floor(event.timestampMs / this._config.bucketMs);
    let ring = this._rings.get(key);
    if (!ring) {
      ring = {
        counts: new Array(this._config.windowCount).fill(0),
        head: 0,
        headEpoch: epoch,
        sum: 0,
        sumSq: 0,
      };
      this._rings.set(key, ring);
    }

    // Advance the ring to the event's epoch — buckets we skipped are 0.
    if (epoch > ring.headEpoch) {
      const advance = Math.min(epoch - ring.headEpoch, this._config.windowCount);
      for (let i = 0; i < advance; i++) {
        ring.head = (ring.head + 1) % this._config.windowCount;
        this._subtract(ring, ring.counts[ring.head]);
        ring.counts[ring.head] = 0;
      }
      ring.headEpoch = epoch;
    } else if (epoch < ring.headEpoch - this._config.windowCount) {
      // Event far in the past — ignore (out of retention).
      return null;
    }

    // Record the count.
    const idx = ring.head - (ring.headEpoch - epoch);
    const slot = ((idx % this._config.windowCount) + this._config.windowCount) % this._config.windowCount;
    this._subtract(ring, ring.counts[slot]);
    ring.counts[slot]++;
    this._add(ring, 1);

    // Evaluate the *previous* buckets' baseline vs this bucket's count.
    const { mean, stddev } = this._stats(ring);
    const count = ring.counts[slot];
    if (count < this._config.minCount || stddev === 0) {
      // With zero variance and a big count jump, still flag via ratio.
      if (stddev === 0 && count >= this._config.minCount && mean > 0 && count > mean * 3) {
        return this._mkAnomaly(key, epoch, count, mean, stddev, (count - mean) / Math.max(1e-9, stddev), event);
      }
      return null;
    }
    const z = (count - mean) / stddev;
    if (z >= this._config.zThreshold) {
      return this._mkAnomaly(key, epoch, count, mean, stddev, z, event);
    }
    return null;
  }

  private _mkAnomaly(
    key: string,
    epoch: number,
    count: number,
    mean: number,
    stddev: number,
    zScore: number,
    event: NormalizedEvent
  ): Anomaly {
    return {
      key,
      bucketStartMs: epoch * this._config.bucketMs,
      count,
      mean,
      stddev,
      zScore,
      sampleEvent: event,
    };
  }

  private _add(ring: BucketRing, v: number): void {
    ring.sum += v;
    ring.sumSq += v * v;
  }

  private _subtract(ring: BucketRing, v: number): void {
    ring.sum -= v;
    ring.sumSq -= v * v;
    if (ring.sumSq < 0) ring.sumSq = 0; // float drift guard
  }

  private _stats(ring: BucketRing): { mean: number; stddev: number } {
    const n = this._config.windowCount;
    const mean = ring.sum / n;
    const variance = Math.max(0, ring.sumSq / n - mean * mean);
    return { mean, stddev: Math.sqrt(variance) };
  }

  /** Current mean rate for a key — for dashboards. */
  baseline(key: string): { mean: number; stddev: number } | undefined {
    const ring = this._rings.get(key);
    return ring ? this._stats(ring) : undefined;
  }
}
