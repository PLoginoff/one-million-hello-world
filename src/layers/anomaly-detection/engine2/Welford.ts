/**
 * Online Z-Score Detector — Welford's algorithm.
 *
 * Maintains running (mean, M2) in O(1) per point with no batch retrain
 * and no window buffer. Streaming update:
 *
 *   n   += 1
 *   δ    = x − mean
 *   mean += δ / n
 *   M2  += δ · (x − mean)
 *   var  = M2 / (n − 1)          (sample variance)
 *
 * The z-score for each incoming point is computed against the running
 * stats *before* the point is folded in (prequential evaluation), so the
 * point can't mask itself.
 *
 * Numerically stable vs. naive `Σx² − n·x̄²` which can go negative from
 * catastrophic cancellation. Supports decayed statistics (exponential
 * forgetting) for non-stationary streams, and merging two estimators
 * (parallel/sharded computation, Chan et al. 1979).
 *
 * @module AnomalyDetection/Engine2
 */

export interface WelfordOptions {
  /** Forgetting factor in (0,1]; 1 = stationary (all points equal
   *  weight). <1 gives recent points more influence. Default 1. */
  readonly decay?: number;
  /** Minimum samples before flagging (warm-up). Default 2. */
  readonly warmup?: number;
  /** |z| threshold. Default 3. */
  readonly threshold?: number;
}

/** Running mean/variance via Welford. Mergeable. */
export class WelfordEstimator {
  private n = 0;
  private mean_ = 0;
  private m2 = 0;
  private readonly decay: number;

  constructor(decay = 1) {
    this.decay = decay;
  }

  /** Fold one observation in. */
  add(x: number): void {
    // Decay prior mass before the update — exponential forgetting.
    if (this.decay < 1 && this.n > 0) {
      this.n *= this.decay;
      this.m2 *= this.decay;
    }
    this.n += 1;
    const delta = x - this.mean_;
    this.mean_ += delta / this.n;
    this.m2 += delta * (x - this.mean_);
  }

  /** Merge another estimator into this one (Chan parallel formula). */
  merge(other: WelfordEstimator): void {
    if (other.n === 0) return;
    if (this.n === 0) {
      this.n = other.n;
      this.mean_ = other.mean_;
      this.m2 = other.m2;
      return;
    }
    const total = this.n + other.n;
    const delta = other.mean_ - this.mean_;
    this.mean_ += (delta * other.n) / total;
    this.m2 += other.m2 + (delta * delta * this.n * other.n) / total;
    this.n = total;
  }

  get count(): number {
    return this.n;
  }
  get mean(): number {
    return this.mean_;
  }
  /** Sample variance (n−1 denominator). */
  get variance(): number {
    return this.n > 1 ? this.m2 / (this.n - 1) : 0;
  }
  get stddev(): number {
    return Math.sqrt(this.variance);
  }

  /** Snapshot the estimator (for rollback / read-only access). */
  snapshot(): { n: number; mean: number; m2: number } {
    return { n: this.n, mean: this.mean_, m2: this.m2 };
  }
  restore(s: { n: number; mean: number; m2: number }): void {
    this.n = s.n;
    this.mean_ = s.mean;
    this.m2 = s.m2;
  }
}

export interface OnlineScore {
  readonly value: number;
  readonly z: number;
  readonly isAnomaly: boolean;
  readonly mean: number;
  readonly stddev: number;
  /** Samples seen so far. */
  readonly n: number;
}

/**
 * Streaming z-score detector. Flags |z| > threshold where z is computed
 * against the running distribution BEFORE the point is added, so a
 * single outlier can't inflate the variance and hide itself (masking).
 */
export class OnlineZScoreDetector {
  readonly name = 'online-zscore';
  private readonly est: WelfordEstimator;
  private readonly warmup: number;
  private readonly threshold: number;

  constructor(options: WelfordOptions = {}) {
    this.est = new WelfordEstimator(options.decay ?? 1);
    this.warmup = options.warmup ?? 2;
    this.threshold = options.threshold ?? 3;
  }

  /** Score one point and fold it into the running stats. */
  update(value: number): OnlineScore {
    const n = this.est.count;
    const mean = this.est.mean;
    const sd = this.est.stddev;
    let z = 0;
    let isAnomaly = false;
    if (n >= this.warmup && sd > 0) {
      z = (value - mean) / sd;
      isAnomaly = Math.abs(z) > this.threshold;
    } else if (n >= this.warmup && sd === 0 && value !== mean) {
      // zero-variance stream: any deviation is infinitely anomalous
      z = value > mean ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      isAnomaly = true;
    }
    this.est.add(value);
    return { value, z, isAnomaly, mean, stddev: sd, n: n + 1 };
  }

  /** Score without mutating state (peek). */
  peek(value: number): OnlineScore {
    const snap = this.est.snapshot();
    const s = this.update(value);
    this.est.restore(snap);
    return s;
  }

  reset(): void {
    this.est.restore({ n: 0, mean: 0, m2: 0 });
  }

  /** Expose the underlying estimator (e.g. for drift inspection). */
  get estimator(): WelfordEstimator {
    return this.est;
  }
}
