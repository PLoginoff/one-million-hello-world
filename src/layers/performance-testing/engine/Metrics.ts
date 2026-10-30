/**
 * Metrics — latency percentiles, throughput windows, error tracking
 *
 * Core measurement machinery for the load engine:
 *
 *  - {@link ReservoirSampler}: Vitter's Algorithm R keeps a uniform
 *    random sample of size k over a stream of unknown length in O(1)
 *    amortized per sample and O(k) memory. Percentiles are estimated
 *    from the sorted reservoir — bounded memory at any traffic volume,
 *    unlike t-digest (which would be overkill at test-harness scale).
 *
 *  - {@link SlidingThroughputWindow}: bucketized circular counter —
 *    events are tallied into `bucketCount` slots of `windowMs/bucketCount`
 *    each, giving O(1) record and O(bucketCount) queries with a sliding
 *    error bounded by one bucket.
 *
 *  - {@link ErrorRateTracker}: sliding error-ratio over the same
 *    bucket scheme, with threshold alerting.
 *
 * All clocks are injectable for deterministic simulation of long runs.
 *
 * @module PerformanceTesting/Engine
 */

/* ------------------------------------------------------------------------ */
/* PRNG                                                                     */
/* ------------------------------------------------------------------------ */

/**
 * mulberry32 — small, fast, deterministic 32-bit PRNG.
 * Period 2^32; adequate for sampling (not cryptographic).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [min, max] inclusive via a rand() source. */
export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Exponential sample (think/inter-arrival times) with rate lambda. */
export function randExponential(rand: () => number, lambda: number): number {
  // inverse-CDF: -ln(1-U)/lambda; guard U=0 → ln(1)=0
  const u = rand() || Number.EPSILON;
  return -Math.log(1 - u) / lambda;
}

/* ------------------------------------------------------------------------ */
/* Reservoir sampler                                                        */
/* ------------------------------------------------------------------------ */

/**
 * Vitter Algorithm R reservoir sampler.
 *
 * Maintains a uniform k-sample over all observed values: for the i-th
 * incoming value (i > k) it replaces a random reservoir slot with
 * probability k/i. Every prefix of the stream is therefore equally
 * represented — percentile estimates stay unbiased at any stream length.
 *
 * record(): amortized O(1). percentile(): O(k log k) sort on demand.
 */
export class ReservoirSampler {
  private readonly _k: number;
  private readonly _rand: () => number;
  private readonly _reservoir: number[] = [];
  private _seen = 0;

  constructor(capacity = 1024, seed = 0x9e3779b9) {
    if (capacity <= 0) throw new Error('reservoir capacity must be > 0');
    this._k = capacity;
    this._rand = mulberry32(seed);
  }

  /** Number of values ever observed. */
  get seen(): number {
    return this._seen;
  }

  get capacity(): number {
    return this._k;
  }

  /** Record one sample. */
  record(value: number): void {
    this._seen++;
    if (this._reservoir.length < this._k) {
      this._reservoir.push(value);
      return;
    }
    // j in [0, seen): replace reservoir[j] when j < k — probability k/seen
    const j = Math.floor(this._rand() * this._seen);
    if (j < this._k) {
      this._reservoir[j] = value;
    }
  }

  /**
   * Estimate the p-th percentile (p in [0,100]) using the
   * nearest-rank method on the sorted reservoir.
   * Returns NaN when empty.
   */
  percentile(p: number): number {
    const n = this._reservoir.length;
    if (n === 0) return NaN;
    const sorted = [...this._reservoir].sort((a, b) => a - b);
    const rank = Math.ceil((p / 100) * n);
    return sorted[Math.min(n - 1, Math.max(0, rank - 1))];
  }

  /** p50 / p90 / p95 / p99 / min / max / mean snapshot. */
  snapshot(): LatencySnapshot {
    const n = this._reservoir.length;
    if (n === 0) {
      return { count: 0, min: NaN, max: NaN, mean: NaN, p50: NaN, p90: NaN, p95: NaN, p99: NaN };
    }
    const sorted = [...this._reservoir].sort((a, b) => a - b);
    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    const pick = (p: number): number => {
      const rank = Math.ceil((p / 100) * n);
      return sorted[Math.min(n - 1, Math.max(0, rank - 1))];
    };
    return {
      count: this._seen,
      min: sorted[0],
      max: sorted[n - 1],
      mean,
      p50: pick(50),
      p90: pick(90),
      p95: pick(95),
      p99: pick(99),
    };
  }
}

export interface LatencySnapshot {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
}

/* ------------------------------------------------------------------------ */
/* Sliding throughput window                                                */
/* ------------------------------------------------------------------------ */

/**
 * Bucketized circular event counter.
 *
 * Time is divided into `bucketCount` buckets spanning `windowMs`.
 * record() increments the current bucket (rolling forward and zeroing
 * expired buckets). total() sums the live window in O(bucketCount).
 * Throughput = total / windowSeconds — a smoothed rate that avoids the
 * sawtooth of fixed-interval counting.
 */
export class SlidingThroughputWindow {
  private readonly _buckets: number[];
  private readonly _bucketMs: number;
  private _bucketStart: number;
  private _head = 0; // index of bucket containing _bucketStart
  private _total = 0;

  constructor(
    private readonly _windowMs: number,
    bucketCount = 60,
    private readonly _clock: () => number = Date.now
  ) {
    this._buckets = new Array<number>(bucketCount).fill(0);
    this._bucketMs = _windowMs / bucketCount;
    this._bucketStart = Math.floor(this._clock() / this._bucketMs) * this._bucketMs;
  }

  private _roll(): void {
    const now = this._clock();
    if (now < this._bucketStart + this._bucketMs) return;
    const elapsed = Math.floor((now - this._bucketStart) / this._bucketMs);
    const steps = Math.min(elapsed, this._buckets.length);
    for (let s = 1; s <= steps; s++) {
      const idx = (this._head + s) % this._buckets.length;
      this._total -= this._buckets[idx];
      this._buckets[idx] = 0;
    }
    this._head = (this._head + steps) % this._buckets.length;
    this._bucketStart += steps * this._bucketMs;
  }

  /** Record `count` events at the current clock position. */
  record(count = 1): void {
    this._roll();
    this._buckets[this._head] += count;
    this._total += count;
  }

  /** Events inside the live window. */
  total(): number {
    this._roll();
    return this._total;
  }

  /** Smoothed events-per-second over the window. */
  perSecond(): number {
    this._roll();
    return this._total / (this._windowMs / 1000);
  }
}

/* ------------------------------------------------------------------------ */
/* Error-rate tracking                                                      */
/* ------------------------------------------------------------------------ */

export type ErrorClass = 'timeout' | 'http5xx' | 'http4xx' | 'connection' | 'assertion' | 'other';

export interface ErrorEvent {
  readonly at: number;
  readonly klass: ErrorClass;
  readonly message?: string;
}

/**
 * Sliding-window error-rate tracker with a hard threshold.
 * rate = errors / max(1, total) inside the window.
 */
export class ErrorRateTracker {
  private readonly _ok: SlidingThroughputWindow;
  private readonly _err: SlidingThroughputWindow;
  private readonly _byClass = new Map<ErrorClass, number>();
  private readonly _recent: ErrorEvent[] = [];
  private static readonly MAX_RECENT = 100;

  constructor(
    windowMs: number,
    private readonly _clock: () => number = Date.now
  ) {
    this._ok = new SlidingThroughputWindow(windowMs, 60, _clock);
    this._err = new SlidingThroughputWindow(windowMs, 60, _clock);
  }

  recordSuccess(): void {
    this._ok.record(1);
  }

  recordError(klass: ErrorClass, message?: string): void {
    this._err.record(1);
    this._byClass.set(klass, (this._byClass.get(klass) ?? 0) + 1);
    this._recent.push({ at: this._clock(), klass, message });
    if (this._recent.length > ErrorRateTracker.MAX_RECENT) {
      this._recent.shift();
    }
  }

  /** Sliding error ratio in [0,1]. */
  rate(): number {
    const e = this._err.total();
    const t = e + this._ok.total();
    return t === 0 ? 0 : e / t;
  }

  get totalErrors(): number {
    let n = 0;
    for (const v of this._byClass.values()) n += v;
    return n;
  }

  byClass(): ReadonlyMap<ErrorClass, number> {
    return new Map(this._byClass);
  }

  recentErrors(): readonly ErrorEvent[] {
    return [...this._recent];
  }
}

/* ------------------------------------------------------------------------ */
/* Statistics for regression detection                                      */
/* ------------------------------------------------------------------------ */

/**
 * Welch's t-test for two independent samples with unequal variances.
 * Returns the two-tailed p-value approximated via the t-distribution
 * with Welch–Satterthwaite degrees of freedom, evaluated through the
 * regularized incomplete beta function (continued fraction).
 *
 * Used to decide whether a latency/throughput delta vs a baseline is a
 * statistically significant regression rather than noise.
 */
export function welchTTest(a: readonly number[], b: readonly number[]): {
  readonly t: number;
  readonly df: number;
  readonly pValue: number;
} {
  const stats = (xs: readonly number[]): { mean: number; var: number; n: number } => {
    const n = xs.length;
    const mean = xs.reduce((s, x) => s + x, 0) / n;
    const varr = n > 1 ? xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
    return { mean, var: varr, n };
  };
  const A = stats(a);
  const B = stats(b);
  if (A.n < 2 || B.n < 2) {
    return { t: 0, df: 0, pValue: 1 };
  }
  const se2 = A.var / A.n + B.var / B.n;
  if (se2 === 0) {
    // both constant
    return { t: A.mean === B.mean ? 0 : Infinity, df: A.n + B.n - 2, pValue: A.mean === B.mean ? 1 : 0 };
  }
  const t = (A.mean - B.mean) / Math.sqrt(se2);
  const df =
    se2 * se2 /
    ((A.var / A.n) ** 2 / (A.n - 1) + (B.var / B.n) ** 2 / (B.n - 1));
  const pValue = 2 * tDistCdf(-Math.abs(t), df);
  return { t, df, pValue };
}

/** Student t CDF via regularized incomplete beta. */
function tDistCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const ib = regularizedBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

/**
 * Regularized incomplete beta I_x(a,b) via Lentz continued fraction —
 * Numerical Recipes §6.4. Converges to ~1e-12 quickly for a,b > 0.
 */
export function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // symmetry: evaluate with reflected args when x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedBeta(1 - x, b, a);
  }
  // ln B(a,b) = lnΓ(a) + lnΓ(b) − lnΓ(a+b)
  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  // I_x(a,b) = e^{a ln x + b ln(1-x) - lnB} / a * cf  — NR betacf form
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
  // Lentz's continued fraction
  const maxIter = 200;
  const eps = 1e-14;
  let f = 1;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  f = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    f *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    f *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return front * f;
}

/** Lanczos approximation of ln Γ(z) (g=7, n=9). */
export function lgamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
