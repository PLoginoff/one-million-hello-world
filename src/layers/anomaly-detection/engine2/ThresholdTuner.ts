/**
 * Threshold Auto-Tuning — pick an alert threshold for a target false-
 * positive rate, online.
 *
 * Problem: a fixed z/score threshold over- or under-fires as the score
 * distribution drifts. We keep a running estimate of the score
 * distribution's tail and pick the threshold at the (1 − targetFPR)
 * quantile.
 *
 * Implementation: P² algorithm for a single target quantile — O(1)
 * memory, O(1) per update, no stored window. The classic Jain & Chlamtac
 * (1985) estimator tracks one quantile via a piecewise-parabolic
 * predictor; we track the (1 − FPR) quantile of *normal* scores.
 *
 * Two modes:
 *   - observe normal scores only (semi-supervised): threshold = FPR
 *     quantile of the benign stream.
 *   - observe all scores: threshold tracks the tail — assumes actual
 *     anomalies are rare enough not to shift the quantile much.
 *
 * @module AnomalyDetection/Engine2
 */

/**
 * P² quantile estimator — maintains 5 markers (min, p/2, p, 3p/2·? no:
 * min, p-quantile's quartiles…) Actually: markers at 0, p/2, p,
 * (1+p)/2, 1 positions with piecewise-parabolic interpolation between
 * them. Standard implementation from Jain & Chlamtac 1985.
 */
export class P2Quantile {
  private readonly p: number;
  private readonly q: number[] = []; // marker heights (5)
  private readonly n: number[] = []; // marker positions (5)
  private readonly np: number[] = []; // desired positions
  private readonly dn: number[] = []; // position increments
  private init: number[] = [];

  constructor(p: number) {
    if (p <= 0 || p >= 1) throw new Error('p must be in (0,1)');
    this.p = p;
    // desired marker positions (1-indexed conceptual): 1, 1+2p, 1+4p, 1+2+2p, 5
    this.np = [1, 1 + 2 * p, 1 + 4 * p, 3 + 2 * p, 5];
    this.dn = [0, p / 2, p, (1 + p) / 2, 1];
  }

  get count(): number {
    return this.init.length + (this.q.length > 0 ? this.n[4] : 0) - Math.min(this.init.length, 5) + (this.q.length > 0 ? 0 : 0);
  }

  /** Feed one observation. */
  add(x: number): void {
    if (this.q.length === 0) {
      this.init.push(x);
      if (this.init.length === 5) {
        this.init.sort((a, b) => a - b);
        this.q.push(...this.init);
        this.n.push(1, 2, 3, 4, 5);
        this.init = [];
      }
      return;
    }

    // Find cell k such that q[k-1] <= x < q[k]
    let k: number;
    if (x < this.q[0]) {
      this.q[0] = x;
      k = 0;
    } else if (x < this.q[1]) k = 0;
    else if (x < this.q[2]) k = 1;
    else if (x < this.q[3]) k = 2;
    else if (x <= this.q[4]) k = 3;
    else {
      this.q[4] = x;
      k = 3;
    }

    for (let i = k + 1; i < 5; i++) this.n[i]++;
    for (let i = 0; i < 5; i++) this.np[i] += this.dn[i];

    for (let i = 1; i <= 3; i++) {
      const d = this.np[i] - this.n[i];
      if ((d >= 1 && this.n[i + 1] - this.n[i] > 1) || (d <= -1 && this.n[i - 1] - this.n[i] < -1)) {
        const dSign = d >= 1 ? 1 : -1;
        const qNew = this.parabolic(i, dSign);
        if (this.q[i - 1] < qNew && qNew < this.q[i + 1]) {
          this.q[i] = qNew;
        } else {
          this.q[i] = this.linear(i, dSign);
        }
        this.n[i] += dSign;
      }
    }
  }

  /** Current quantile estimate; NaN until 5 samples seen. */
  get value(): number {
    if (this.q.length === 0) return NaN;
    return this.q[2];
  }

  get ready(): boolean {
    return this.q.length > 0;
  }

  private parabolic(i: number, d: number): number {
    const n = this.n;
    const q = this.q;
    return (
      q[i] +
      (d / (n[i + 1] - n[i - 1])) *
        (((n[i] - n[i - 1] + d) * (q[i + 1] - q[i])) / (n[i + 1] - n[i]) +
          ((n[i + 1] - n[i] - d) * (q[i] - q[i - 1])) / (n[i] - n[i - 1]))
    );
  }

  private linear(i: number, d: number): number {
    const n = this.n;
    const q = this.q;
    return q[i] + (d * (q[i + d] - q[i])) / (n[i + d] - n[i]);
  }
}

export interface ThresholdTunerOptions {
  /** Target false-positive rate, e.g. 0.01 → threshold at 99th pct of
   *  benign scores. */
  readonly targetFpr: number;
  /** Hard lower/upper bounds on the emitted threshold. */
  readonly minThreshold?: number;
  readonly maxThreshold?: number;
}

/**
 * Wraps a P² estimator to emit a bounded threshold for a scorer.
 * Caller feeds it benign (or all) scores; `threshold()` is the current
 * recommended cutoff.
 */
export class ThresholdTuner {
  private readonly p2: P2Quantile;
  private readonly min: number;
  private readonly max: number;
  private readonly fpr: number;
  private seen = 0;

  constructor(options: ThresholdTunerOptions) {
    this.fpr = options.targetFpr;
    this.p2 = new P2Quantile(1 - options.targetFpr);
    this.min = options.minThreshold ?? 0;
    this.max = options.maxThreshold ?? Number.POSITIVE_INFINITY;
  }

  /** Feed one benign (or ambient) score. */
  observe(score: number): void {
    this.seen++;
    this.p2.add(score);
  }

  /** Current recommended threshold (bounded). NaN until warm. */
  threshold(): number {
    const v = this.p2.value;
    if (Number.isNaN(v)) return v;
    return Math.min(this.max, Math.max(this.min, v));
  }

  /** Is `score` anomalous at the tuned threshold? */
  isAnomaly(score: number): boolean {
    const t = this.threshold();
    return !Number.isNaN(t) && score > t;
  }

  get ready(): boolean {
    return this.p2.ready;
  }
  get sampleCount(): number {
    return this.seen;
  }
}
