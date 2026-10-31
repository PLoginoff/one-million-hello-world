/**
 * Sampling Profiler — Bounded-Memory Distribution Estimation
 *
 * Answers "what does the latency distribution look like" for a metric
 * stream without storing every sample, using two complementary
 * bounded-memory sketches:
 *
 *  1. **Reservoir sampling** (Vitter's Algorithm R, 1985): keeps a
 *     uniform-random subset of size k from a stream of unknown length
 *     in O(k) memory. Each incoming item i is admitted with
 *     probability k/i, evicting a uniformly random reservoir member —
 *     provably uniform: every item in the stream ends up in the
 *     reservoir with equal probability k/N.
 *
 *  2. **Weighted-centroid digest** (t-digest inspired): percentiles
 *     over arbitrary quantiles via a fixed set of centroids. Each
 *     centroid holds a (mean, weight) pair; inserts merge into the
 *     nearest centroid when under a weight budget, else seed a new
 *     one; when the digest overflows, adjacent centroids compress.
 *     Queries walk the ordered centroid list and interpolate within
 *     the straddling centroid — O(K) insert/query for K centroids.
 *
 * The reservoir answers "give me a representative sample" (exact
 * values, unbiased); the digest answers "what's p50/p95/p99" (rank
 * estimates, small relative error, worst at distribution tails where
 * the budget forces coarser centroid merging — the standard t-digest
 * tradeoff).
 *
 * Both are deterministic when the RNG is injected — tests pin the
 * admission decisions exactly.
 *
 * Complexity:
 *  - observe():     O(1) reservoir + O(K) digest insert
 *  - quantile():    O(K)
 *  - sample():      O(k)
 *
 * @module AnalyticsLayer/Engine2
 */

/** Injectable random source (mirrors EventTracker's convention). */
export interface ProfileRandom {
  /** Uniform [0, 1). */
  next(): number;
}

export class DefaultProfileRandom implements ProfileRandom {
  next(): number {
    return Math.random();
  }
}

/** Deterministic cyclic source for tests. */
export class SequenceProfileRandom implements ProfileRandom {
  private i = 0;
  constructor(private readonly values: readonly number[]) {
    if (values.length === 0) throw new Error('values must be non-empty');
  }
  next(): number {
    const v = this.values[this.i % this.values.length]!;
    this.i++;
    return v;
  }
}

/* ------------------------------------------------------------------ */
/* Reservoir                                                           */
/* ------------------------------------------------------------------ */

export interface ReservoirOptions {
  /** Reservoir capacity k. */
  readonly size: number;
  readonly random?: ProfileRandom;
}

/**
 * Algorithm R reservoir: uniform sample of `size` items over a
 * stream of unknown N. After N > k items, each stream position held
 * the reservoir slot with equal probability.
 */
export class ReservoirSampler {
  private readonly k: number;
  private readonly random: ProfileRandom;
  private readonly reservoir: number[] = [];
  private seen = 0;

  constructor(options: ReservoirOptions) {
    if (options.size <= 0) throw new Error('reservoir size must be positive');
    this.k = options.size;
    this.random = options.random ?? new DefaultProfileRandom();
  }

  /**
   * Offer a value. First k values fill the reservoir; thereafter
   * value i (1-based) replaces a random slot with probability k/i.
   */
  observe(value: number): void {
    this.seen++;
    if (this.reservoir.length < this.k) {
      this.reservoir.push(value);
      return;
    }
    const j = Math.floor(this.random.next() * this.seen);
    if (j < this.k) {
      this.reservoir[j] = value;
    }
  }

  /** Current sample (unordered — reservoir order is not stream order). */
  sample(): readonly number[] {
    return this.reservoir;
  }

  /** Sorted copy for quantile reads on the sample itself. */
  sortedSample(): readonly number[] {
    return [...this.reservoir].sort((a, b) => a - b);
  }

  /** Total values offered. */
  get count(): number {
    return this.seen;
  }

  clear(): void {
    this.reservoir.length = 0;
    this.seen = 0;
  }
}

/* ------------------------------------------------------------------ */
/* Centroid digest                                                     */
/* ------------------------------------------------------------------ */

interface Centroid {
  mean: number;
  weight: number;
}

export interface DigestOptions {
  /**
   * Target number of centroids (compression parameter K). Higher K =
   * better tail precision, more memory. Default 100.
   */
  readonly centroids?: number;
}

/**
 * Weighted-centroid digest for streaming quantile estimation.
 *
 * The implementation is a simplified t-digest: instead of the full
 * scale-function machinery, centroids are merged into the nearest
 * existing centroid when the total count exceeds K — keeping the
 * structure bounded at ~2K centroids between compressions. Each
 * merge recomputes the weighted mean, so a centroid always
 * represents the center of mass of its constituent samples.
 */
export class CentroidDigest {
  private readonly k: number;
  private centroids: Centroid[] = [];
  private total = 0;
  private minV = Number.POSITIVE_INFINITY;
  private maxV = Number.NEGATIVE_INFINITY;

  constructor(options: DigestOptions = {}) {
    this.k = options.centroids ?? 100;
    if (this.k <= 0) throw new Error('centroids must be positive');
  }

  /** Insert one observation. O(K) — nearest-centroid scan. */
  observe(value: number): void {
    this.total++;
    if (value < this.minV) this.minV = value;
    if (value > this.maxV) this.maxV = value;

    if (this.centroids.length < this.k) {
      // Insert a singleton centroid, keeping the list sorted by mean.
      this.insertSorted({ mean: value, weight: 1 });
      return;
    }

    // Find the nearest centroid by mean; merge into it.
    const idx = this.nearestIndex(value);
    const c = this.centroids[idx]!;
    c.mean = (c.mean * c.weight + value) / (c.weight + 1);
    c.weight += 1;

    // Re-sort if the merge shifted this centroid's mean past a
    // neighbor (only local movement possible).
    this.rebubble(idx);

    // Periodic compression when the list grows past 2K — shouldn't
    // happen with merge-into-nearest, but adjacent identical means
    // can still benefit from consolidation.
    if (this.centroids.length > 2 * this.k) this.compress();
  }

  /**
   * Estimate the value at quantile q ∈ [0, 1] by walking the ordered
   * centroids with linear interpolation inside the straddling one.
   */
  quantile(q: number): number {
    if (q < 0 || q > 1) throw new Error('quantile must be in [0,1]');
    if (this.centroids.length === 0) return Number.NaN;
    if (q === 0) return this.minV;
    if (q === 1) return this.maxV;

    const target = q * this.total;
    let cum = 0;
    for (let i = 0; i < this.centroids.length; i++) {
      const c = this.centroids[i]!;
      const prev = cum;
      cum += c.weight;
      if (target <= cum) {
        // Interpolate within this centroid between the previous
        // centroid's mean (or min) and this one.
        const leftMean = i === 0 ? this.minV : this.centroids[i - 1]!.mean;
        const rightMean = i === this.centroids.length - 1 ? this.maxV : c.mean;
        const frac = c.weight > 0 ? (target - prev) / c.weight : 0;
        return leftMean + (rightMean - leftMean) * Math.max(0, Math.min(1, frac));
      }
    }
    return this.maxV;
  }

  /** Estimate the rank (fraction of samples <= v). */
  rank(v: number): number {
    if (this.centroids.length === 0 || this.total === 0) return Number.NaN;
    if (v <= this.minV) return 0;
    if (v >= this.maxV) return 1;
    let cum = 0;
    for (let i = 0; i < this.centroids.length; i++) {
      const c = this.centroids[i]!;
      if (v < c.mean) {
        const prevMean = i === 0 ? this.minV : this.centroids[i - 1]!.mean;
        const frac = c.mean === prevMean ? 1 : (v - prevMean) / (c.mean - prevMean);
        return (cum + c.weight * Math.max(0, Math.min(1, frac))) / this.total;
      }
      cum += c.weight;
    }
    return 1;
  }

  get count(): number {
    return this.total;
  }

  get centroidCount(): number {
    return this.centroids.length;
  }

  /** Snapshot of centroids for inspection/tests. */
  digest(): readonly { mean: number; weight: number }[] {
    return this.centroids.map((c) => ({ ...c }));
  }

  /* --------------------------- internals ------------------------- */

  private insertSorted(c: Centroid): void {
    let lo = 0;
    let hi = this.centroids.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.centroids[mid]!.mean <= c.mean) lo = mid + 1;
      else hi = mid;
    }
    this.centroids.splice(lo, 0, c);
  }

  private nearestIndex(value: number): number {
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.centroids.length; i++) {
      const d = Math.abs(this.centroids[i]!.mean - value);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  /** Restore sort after an in-place mean update. */
  private rebubble(idx: number): void {
    const c = this.centroids[idx]!;
    while (idx > 0 && this.centroids[idx - 1]!.mean > c.mean) {
      this.centroids[idx] = this.centroids[idx - 1]!;
      this.centroids[idx - 1] = c;
      idx--;
    }
    while (idx < this.centroids.length - 1 && this.centroids[idx + 1]!.mean < c.mean) {
      this.centroids[idx] = this.centroids[idx + 1]!;
      this.centroids[idx + 1] = c;
      idx++;
    }
  }

  /**
   * Merge adjacent centroid pairs (smallest combined weight first)
   * until back under K.
   */
  private compress(): void {
    while (this.centroids.length > this.k) {
      let bestIdx = 0;
      let bestW = Number.POSITIVE_INFINITY;
      for (let i = 0; i < this.centroids.length - 1; i++) {
        const w = this.centroids[i]!.weight + this.centroids[i + 1]!.weight;
        if (w < bestW) {
          bestW = w;
          bestIdx = i;
        }
      }
      const a = this.centroids[bestIdx]!;
      const b = this.centroids[bestIdx + 1]!;
      a.mean = (a.mean * a.weight + b.mean * b.weight) / (a.weight + b.weight);
      a.weight += b.weight;
      this.centroids.splice(bestIdx + 1, 1);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Profiler façade                                                     */
/* ------------------------------------------------------------------ */

export interface ProfilerOptions {
  /** Reservoir size per metric (default 1_000). */
  readonly reservoirSize?: number;
  /** Centroid cap per metric (default 100). */
  readonly centroids?: number;
  readonly random?: ProfileRandom;
}

interface MetricProfile {
  reservoir: ReservoirSampler;
  digest: CentroidDigest;
}

export interface DistributionSummary {
  readonly metric: string;
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
  /** Reservoir-derived mean over the sample (unbiased). */
  readonly sampleMean: number;
}

/**
 * One profiler over many metrics: each metric gets its own reservoir
 * + digest pair, created lazily on first observation.
 */
export class SamplingProfiler {
  private readonly profiles = new Map<string, MetricProfile>();
  private readonly reservoirSize: number;
  private readonly centroids: number;
  private readonly random: ProfileRandom;

  constructor(options: ProfilerOptions = {}) {
    this.reservoirSize = options.reservoirSize ?? 1_000;
    this.centroids = options.centroids ?? 100;
    this.random = options.random ?? new DefaultProfileRandom();
  }

  /** Record one observation for a metric. */
  observe(metric: string, value: number): void {
    const p = this.profile(metric);
    p.reservoir.observe(value);
    p.digest.observe(value);
  }

  /** Digest percentile for a metric. */
  quantile(metric: string, q: number): number {
    return this.profiles.get(metric)?.digest.quantile(q) ?? Number.NaN;
  }

  /** Fraction of observed values <= v. */
  rank(metric: string, v: number): number {
    return this.profiles.get(metric)?.digest.rank(v) ?? Number.NaN;
  }

  /** Uniform sample (reservoir) for a metric. */
  sample(metric: string): readonly number[] {
    return this.profiles.get(metric)?.reservoir.sample() ?? [];
  }

  /** Full summary for a dashboard tile. */
  summary(metric: string): DistributionSummary | undefined {
    const p = this.profiles.get(metric);
    if (!p || p.digest.count === 0) return undefined;
    const sample = p.reservoir.sample();
    const mean =
      sample.length > 0 ? sample.reduce((a, b) => a + b, 0) / sample.length : Number.NaN;
    const d = p.digest;
    return {
      metric,
      count: d.count,
      min: d.quantile(0),
      max: d.quantile(1),
      p50: d.quantile(0.5),
      p90: d.quantile(0.9),
      p95: d.quantile(0.95),
      p99: d.quantile(0.99),
      sampleMean: mean,
    };
  }

  /** All tracked metrics. */
  metrics(): string[] {
    return [...this.profiles.keys()];
  }

  /** Digest internals (test/debug). */
  digestOf(metric: string): CentroidDigest | undefined {
    return this.profiles.get(metric)?.digest;
  }

  private profile(metric: string): MetricProfile {
    let p = this.profiles.get(metric);
    if (!p) {
      p = {
        reservoir: new ReservoirSampler({ size: this.reservoirSize, random: this.random }),
        digest: new CentroidDigest({ centroids: this.centroids }),
      };
      this.profiles.set(metric, p);
    }
    return p;
  }
}
