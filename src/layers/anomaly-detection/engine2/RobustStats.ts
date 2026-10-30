/**
 * Robust streaming statistics — median/MAD-based detectors that resist
 * the contamination problem of z-scores (a single outlier inflates the
 * mean/stddev and masks itself).
 *
 *   - `RingBuffer`: O(1) sliding window over the last N points.
 *   - `MedianDetector`: flags |x − median| / MAD > threshold over the
 *     window. MAD ≈ 0.6745·σ for gaussian data → comparable thresholds.
 *   - `ModifiedZScore`: Iglewicz & Hoaglin's modified z —
 *     M_i = 0.6745·(x_i − median)/MAD; flag |M| > 3.5.
 *
 * Windowed (not fully online like Welford) because median needs the
 * actual values — a small ring buffer, O(N) memory, O(N log N) per
 * update for the sort. Use Welford for unbounded streams.
 *
 * @module AnomalyDetection/Engine2
 */

/** Fixed-capacity ring buffer of numbers. */
export class RingBuffer {
  private readonly buf: Float64Array;
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.buf = new Float64Array(capacity);
  }

  push(v: number): void {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  get size(): number {
    return this.count;
  }

  /** Snapshot as a sorted array (for median/quantile). O(n log n). */
  sorted(): number[] {
    const out = new Array<number>(this.count);
    for (let i = 0; i < this.count; i++) out[i] = this.buf[i];
    out.sort((a, b) => a - b);
    return out;
  }

  values(): number[] {
    const out = new Array<number>(this.count);
    for (let i = 0; i < this.count; i++) out[i] = this.buf[i];
    return out;
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
  }
}

function medianOf(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface RobustOptions {
  /** Window size. Default 60. */
  readonly window?: number;
  /** Warmup — min samples before flagging. Default 10. */
  readonly warmup?: number;
  /** Modified-z threshold. Default 3.5 (Iglewicz & Hoaglin). */
  readonly threshold?: number;
}

export interface RobustScore {
  readonly value: number;
  readonly median: number;
  readonly mad: number;
  readonly modifiedZ: number;
  readonly isAnomaly: boolean;
  readonly n: number;
}

/**
 * Median/MAD streaming detector over a sliding window.
 * O(window) memory, O(window log window) per update.
 */
export class MedianMadDetector {
  readonly name = 'median-mad';
  private readonly ring: RingBuffer;
  private readonly warmup: number;
  private readonly threshold: number;

  constructor(options: RobustOptions = {}) {
    this.ring = new RingBuffer(options.window ?? 60);
    this.warmup = options.warmup ?? 10;
    this.threshold = options.threshold ?? 3.5;
  }

  update(value: number): RobustScore {
    const sorted = this.ring.sorted();
    const med = medianOf(sorted);
    const absDev = sorted.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
    const mad = medianOf(absDev);
    let mz = 0;
    let isAnomaly = false;
    const n = this.ring.size;
    if (n >= this.warmup) {
      if (mad > 0) {
        mz = (0.6745 * (value - med)) / mad;
        isAnomaly = Math.abs(mz) > this.threshold;
      } else if (value !== med) {
        mz = value > med ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        isAnomaly = true;
      }
    }
    this.ring.push(value);
    return { value, median: med, mad, modifiedZ: mz, isAnomaly, n };
  }

  reset(): void {
    this.ring.clear();
  }
}
