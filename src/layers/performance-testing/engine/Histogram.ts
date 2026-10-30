/**
 * Histogram — HdrHistogram-style percentile sketch + arrival-rate model
 *
 * {@link HdrHistogram} records latencies into exponentially-spaced
 * buckets (value ranges double every `significantDigits` bins), giving
 * O(1) record, O(buckets) percentile, and bounded relative error —
 * the design behind HdrHistogram/Gil Tene's latency sketch, used by
 * k6/Gatling for tail-latency reporting.
 *
 * Unlike {@link ReservoirSampler} (uniform sample → unbiased estimate),
 * HdrHistogram gives *deterministic* error bounds: a recorded value v
 * sits in a bucket spanning [v', v'·(1+ε)) — percentiles are exact to
 * within bucket resolution.
 *
 * {@link ArrivalRateModel}: open-workload scheduling — requests arrive
 * on a Poisson (exponential inter-arrival) or constant-rate process
 * independent of response latency, versus the closed VU model where
 * each user waits for a response before thinking. Open models are what
 * k6's `ramping-arrival-rate` executor implements.
 *
 * @module PerformanceTesting/Engine
 */

import { mulberry32, randExponential } from './Metrics';

/* ------------------------------------------------------------------------ */
/* HdrHistogram                                                             */
/* ------------------------------------------------------------------------ */

export interface HistogramOptions {
  /** Lowest discernible value (default 1ms). */
  readonly lowest?: number;
  /** Highest trackable value (default 60_000ms). */
  readonly highest?: number;
  /**
   * Significant digits (1-5). `2` → 1% bucket resolution,
   * `3` → 0.1%. Default 2.
   */
  readonly significantDigits?: number;
}

/**
 * HdrHistogram sketch.
 *
 * Layout follows the Hdr spec: each "magnitude" decade is split into
 * `2 * 10^(sig-1)` uniform sub-buckets, so bucket width is a fixed
 * fraction of the current magnitude — `sig=2` → 100 sub-buckets per
 * decade → ~1% relative resolution; `sig=3` → ~0.1%.
 *
 * Indexing: bucket = floor(log2/magnitude) — implemented as a flat
 * array over quantized bounds for clarity; record O(log B) via
 * binary search, percentile O(B) cumulative walk.
 */
export class HdrHistogram {
  private readonly _counts: number[];
  private readonly _buckets: number[] = []; // bucket upper bounds
  private _total = 0;
  private _min = Infinity;
  private _max = -Infinity;
  private readonly _lowest: number;
  private readonly _highest: number;

  constructor(options: HistogramOptions = {}) {
    this._lowest = options.lowest ?? 1;
    this._highest = options.highest ?? 60_000;
    const sig = Math.min(5, Math.max(1, options.significantDigits ?? 2));
    const subBuckets = 2 * Math.pow(10, sig - 1); // per magnitude step
    // Magnitude boundaries: lowest, lowest*2, lowest*4, ... so each
    // bucket covers a fixed fraction of its decade's width.
    let base = this._lowest;
    while (base < this._highest) {
      const width = base / subBuckets || 1;
      for (let i = 1; i <= subBuckets * 2 && base * 2 <= this._highest * 2; i++) {
        const bound = base + i * width;
        if (bound > this._highest * 2) break;
        this._buckets.push(Math.round(bound));
      }
      base *= 2;
    }
    this._buckets.push(this._highest);
    // dedupe + sort (rounding can produce duplicates)
    const uniq = [...new Set(this._buckets)].sort((a, b) => a - b);
    this._buckets.length = 0;
    this._buckets.push(...uniq);
    this._counts = new Array(this._buckets.length).fill(0);
  }

  /** Bucket index for a value — first bound >= v (binary search). */
  private _index(v: number): number {
    let lo = 0;
    let hi = this._buckets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._buckets[mid] >= v) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }

  /** Record one observation. Values out of range clamp to edge buckets. */
  record(v: number): void {
    const clamped = Math.min(this._highest, Math.max(this._lowest, v));
    this._counts[this._index(clamped)]++;
    this._total++;
    this._min = Math.min(this._min, v);
    this._max = Math.max(this._max, v);
  }

  get total(): number {
    return this._total;
  }

  /** Nearest-rank percentile estimate (bucket upper bound). */
  percentile(p: number): number {
    if (this._total === 0) return NaN;
    const rank = Math.ceil((p / 100) * this._total);
    let acc = 0;
    for (let i = 0; i < this._buckets.length; i++) {
      acc += this._counts[i];
      if (acc >= rank) return this._buckets[i];
    }
    return this._buckets[this._buckets.length - 1];
  }

  min(): number {
    return this._total === 0 ? NaN : this._min;
  }

  max(): number {
    return this._total === 0 ? NaN : this._max;
  }

  mean(): number {
    if (this._total === 0) return NaN;
    let sum = 0;
    for (let i = 0; i < this._buckets.length; i++) {
      // approximate bucket midpoint — upper bound * (1+step)/2 is
      // overkill; the bound itself is a good estimator within res
      sum += this._buckets[i] * this._counts[i];
    }
    return sum / this._total;
  }

  /** Snapshot the distribution into a compact table. */
  snapshot(): { p50: number; p90: number; p95: number; p99: number; p999: number; mean: number; min: number; max: number; total: number } {
    return {
      p50: this.percentile(50),
      p90: this.percentile(90),
      p95: this.percentile(95),
      p99: this.percentile(99),
      p999: this.percentile(99.9),
      mean: this.mean(),
      min: this.min(),
      max: this.max(),
      total: this._total,
    };
  }

  /**
   * Iterate non-empty buckets as [upperBound, count] pairs — for
   * rendering or merging histograms.
   */
  *buckets(): Generator<[number, number]> {
    for (let i = 0; i < this._buckets.length; i++) {
      if (this._counts[i] > 0) yield [this._buckets[i], this._counts[i]];
    }
  }

  /** Merge another histogram's buckets (same resolution assumed). */
  merge(other: HdrHistogram): void {
    for (const [bound, count] of other.buckets()) {
      this._counts[this._index(bound)] += count;
    }
    this._total += other.total;
    this._min = Math.min(this._min, other.min());
    this._max = Math.max(this._max, other.max());
  }
}

/* ------------------------------------------------------------------------ */
/* Arrival-rate (open workload) model                                       */
/* ------------------------------------------------------------------------ */

export interface Arrival {
  /** Scheduled time of the request. */
  readonly at: number;
  /** VU slot assigned (round-robin for deterministic mapping). */
  readonly vuSlot: number;
}

/**
 * Open-workload arrival schedule.
 *
 * Closed model (VirtualUser): users wait for a response before the
 * next request — throughput adapts to latency (Little's law).
 * Open model: arrivals are generated by a rate process independent of
 * service — latency spikes don't reduce load, exposing queueing.
 */
export class ArrivalRateModel {
  constructor(private readonly _ratePerSec: number, private readonly _seed = 0) {
    if (_ratePerSec <= 0) throw new Error('rate must be > 0');
  }

  /**
   * Poisson arrivals: exponential inter-arrival times with rate
   * λ = ratePerSec. Produces the standard open-queue arrival process.
   * Returns scheduled arrivals over [0, durationMs].
   */
  poisson(durationMs: number, seed = this._seed): readonly Arrival[] {
    const rand = mulberry32(seed);
    const lambda = this._ratePerSec / 1000; // per ms
    const out: Arrival[] = [];
    let t = 0;
    let slot = 0;
    while (t < durationMs) {
      t += randExponential(rand, lambda);
      if (t < durationMs) out.push({ at: t, vuSlot: slot++ });
    }
    return out;
  }

  /**
   * Constant-rate arrivals: exact 1/rate spacing — deterministic
   * load for capacity measurement (no jitter).
   */
  constant(durationMs: number): readonly Arrival[] {
    const spacing = 1000 / this._ratePerSec;
    const out: Arrival[] = [];
    let slot = 0;
    for (let t = spacing; t < durationMs; t += spacing) {
      out.push({ at: t, vuSlot: slot++ });
    }
    return out;
  }

  /**
   * Ramping arrival rate: linear increase from `startRate` to this
   * model's `ratePerSec` over `rampMs`, then hold — the k6
   * `ramping-arrival-rate` pattern.
   */
  ramping(durationMs: number, startRate: number, rampMs: number, seed = this._seed): readonly Arrival[] {
    const rand = mulberry32(seed);
    const out: Arrival[] = [];
    let t = 0;
    let slot = 0;
    while (t < durationMs) {
      const rate =
        t < rampMs
          ? startRate + (this._ratePerSec - startRate) * (t / rampMs)
          : this._ratePerSec;
      t += randExponential(rand, rate / 1000);
      if (t < durationMs) out.push({ at: t, vuSlot: slot++ });
    }
    return out;
  }

  /**
   * Burst pattern: `burstRate` for `burstMs` every `periodMs` —
   * periodic spikes on top of the base rate.
   */
  bursty(
    durationMs: number,
    burstRate: number,
    burstMs: number,
    periodMs: number,
    seed = this._seed
  ): readonly Arrival[] {
    const rand = mulberry32(seed);
    const out: Arrival[] = [];
    let t = 0;
    let slot = 0;
    while (t < durationMs) {
      const inBurst = (t % periodMs) < burstMs;
      const rate = inBurst ? burstRate : this._ratePerSec;
      t += randExponential(rand, rate / 1000);
      if (t < durationMs) out.push({ at: t, vuSlot: slot++ });
    }
    return out;
  }
}
