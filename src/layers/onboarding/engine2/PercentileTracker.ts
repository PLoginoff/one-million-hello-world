/**
 * Onboarding Engine2 — Percentile Tracker (Streaming Quantiles)
 *
 * Answers "how long did the p50 / p90 / p99 user take to finish step X?"
 * without storing every duration. Two numeric backends:
 *
 *  - `ReservoirSampler` — Vitter's Algorithm R: keeps a uniform k-sample
 *    of the stream in O(k) memory, O(1) amortized per observation.
 *    Unbiased, so percentiles converge on the true distribution.
 *  - Exact small-sample mode — below a configurable threshold we keep
 *    every value; percentiles are then exact, not estimated.
 *
 * Percentile interpolation uses the "nearest-rank with linear
 * interpolation" method (same as NumPy's default 'linear'): for a sorted
 * sample of size n, p-th quantile sits at virtual index p·(n-1), linearly
 * blended between the surrounding order statistics.
 *
 * Complexity: insert O(1) amortized; query O(k log k) for the sort —
 * cached per (key, dirty-flag) so repeated reads stay O(1).
 *
 * @module OnboardingLayer/Engine2
 */

/** Uniform k-reservoir over a numeric stream (Vitter's Algorithm R). */
export class ReservoirSampler {
  private readonly _reservoir: number[];
  private _seen = 0;
  private _seed: number;

  constructor(readonly capacity: number, seed = 0x9e3779b9) {
    if (capacity <= 0) throw new Error('capacity must be > 0');
    this._reservoir = [];
    this._seed = seed >>> 0;
  }

  /** Deterministic PRNG (mulberry32) — tests must be reproducible. */
  private _rand(): number {
    this._seed = (this._seed + 0x6d2b79f5) >>> 0;
    let t = this._seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Algorithm R: first k fill the reservoir; i-th item replaces with prob k/i. */
  observe(value: number): void {
    this._seen++;
    if (this._reservoir.length < this.capacity) {
      this._reservoir.push(value);
      return;
    }
    const j = Math.floor(this._rand() * this._seen);
    if (j < this.capacity) this._reservoir[j] = value;
  }

  /** Total observations (reservoir holds only the sample). */
  get count(): number {
    return this._seen;
  }

  sample(): readonly number[] {
    return this._reservoir;
  }
}

/** Percentile report for one metric key. */
export interface QuantileReport {
  readonly key: string;
  readonly count: number;
  /** Exact = every value kept; estimated = reservoir sampling kicked in. */
  readonly mode: 'exact' | 'estimated';
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
}

export interface PercentileTrackerOptions {
  /**
   * Observations per key before switching from exact storage to a
   * reservoir of this capacity (default 1024).
   */
  readonly exactBelow?: number;
  readonly reservoirCapacity?: number;
  readonly seed?: number;
}

const DEFAULT_EXACT_BELOW = 256;
const DEFAULT_RESERVOIR = 1024;

interface Series {
  /** Exact values while count < exactBelow. */
  exact: number[];
  sampler: ReservoirSampler | null;
  /** Running moments for O(1) mean without a full pass. */
  sum: number;
  count: number;
  /** Cache of the last sorted sample — invalidated on each insert. */
  sorted: number[] | null;
  estimated: boolean;
}

/**
 * Per-metric streaming percentile tracker. Keys are typically
 * `flowId:stepId` for step-completion latency, or `flowId` for total
 * time-to-complete.
 */
export class PercentileTracker {
  private readonly _series = new Map<string, Series>();
  private readonly _exactBelow: number;
  private readonly _reservoirCapacity: number;
  private readonly _seed: number;

  constructor(options?: PercentileTrackerOptions) {
    this._exactBelow = options?.exactBelow ?? DEFAULT_EXACT_BELOW;
    this._reservoirCapacity = options?.reservoirCapacity ?? DEFAULT_RESERVOIR;
    this._seed = options?.seed ?? 0x2545f491;
  }

  /**
   * Record one duration (ms) for `key`. Negative values are clamped to 0 —
   * a clock that went backwards shouldn't corrupt percentiles.
   */
  observe(key: string, durationMs: number): void {
    const v = Math.max(0, durationMs);
    let s = this._series.get(key);
    if (!s) {
      s = {
        exact: [],
        sampler: null,
        sum: 0,
        count: 0,
        sorted: null,
        estimated: false,
      };
      this._series.set(key, s);
    }
    s.count++;
    s.sum += v;
    s.sorted = null;
    if (s.count <= this._exactBelow) {
      s.exact.push(v);
      return;
    }
    s.estimated = true;
    if (!s.sampler) {
      s.sampler = new ReservoirSampler(this._reservoirCapacity, this._seed);
      for (const x of s.exact) s.sampler.observe(x);
      s.exact.length = 0; // release — reservoir owns the sample now
    }
    s.sampler.observe(v);
  }

  /** Sorted working set (exact values or the reservoir sample). */
  private _sorted(s: Series): number[] {
    if (s.sorted) return s.sorted;
    const raw = s.estimated && s.sampler ? [...s.sampler.sample()] : [...s.exact];
    raw.sort((a, b) => a - b);
    s.sorted = raw;
    return raw;
  }

  /**
   * Linear-interpolated quantile over the sorted sample.
   * Virtual index = p·(n-1); blends lo/hi order statistics by the fraction.
   */
  quantile(key: string, p: number): number | null {
    if (p < 0 || p > 1) throw new Error('p must be in [0,1]');
    const s = this._series.get(key);
    if (!s || s.count === 0) return null;
    const a = this._sorted(s);
    const n = a.length;
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return a[lo];
    return a[lo] + (a[hi] - a[lo]) * (idx - lo);
  }

  /** Full percentile report, or null when the key has no data. */
  report(key: string): QuantileReport | null {
    const s = this._series.get(key);
    if (!s || s.count === 0) return null;
    const a = this._sorted(s);
    const q = (p: number): number => {
      const idx = p * (a.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (idx - lo);
    };
    return {
      key,
      count: s.count,
      mode: s.estimated ? 'estimated' : 'exact',
      min: a[0],
      max: a[a.length - 1],
      mean: s.sum / s.count,
      p50: q(0.5),
      p90: q(0.9),
      p95: q(0.95),
      p99: q(0.99),
    };
  }

  /** Reports for every tracked key, sorted by key for stable output. */
  reports(): QuantileReport[] {
    return [...this._series.keys()].sort().map((k) => this.report(k)!);
  }

  count(key: string): number {
    return this._series.get(key)?.count ?? 0;
  }
}
