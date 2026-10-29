/**
 * Chaos Engineering — Streaming Metric Store
 *
 * Fixed-memory metric store for experiment-time observability. Per metric it
 * keeps:
 * - a Welford mean/variance accumulator (O(1) memory),
 * - a P² streaming quantile estimator for p50/p95/p99 (O(1) memory, no
 *   stored samples — the standard algorithm for quantiles on unbounded
 *   streams where storing raw values is infeasible),
 * - a bounded ring of recent values for rate/slope computation.
 *
 * The P² estimator (Jain & Chlamtac 1985) maintains 5 markers tracking the
 * min, p/2, p, (1+p)/2, max quantiles via piecewise-parabolic interpolation;
 * each new sample is O(1) and converges to within a few % of the exact
 * quantile on typical latency distributions.
 *
 * @module ChaosEngineering/Engine
 */

import { ChaosClock } from './ChaosEngineTypes';
import { WelfordAccumulator } from './SteadyStateChecker';

/**
 * P² single-quantile estimator for quantile `p` in (0,1)
 * (Jain & Chlamtac 1985). Keeps exactly 5 markers — O(1) memory regardless
 * of stream length. Marker indices are 0-based internally; desired marker
 * positions np[i] are 1-based ranks per the original paper.
 */
export class P2Quantile {
  private readonly _p: number;
  /** Marker heights (values), sorted ascending once initialized. */
  private readonly _q: number[] = [];
  /** Actual marker positions (1-based ranks among seen samples). */
  private readonly _n: number[] = [1, 2, 3, 4, 5];
  /** Desired marker positions, incremented by dn each observation. */
  private _np: number[];
  private readonly _dn: number[];
  private _count = 0;
  private _initialized = false;

  constructor(p: number) {
    if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0,1)');
    this._p = p;
    // Desired-position increments per observation (the paper's formulation).
    this._dn = [0, p / 2, p, (1 + p) / 2, 1];
    // Initial desired positions for markers 1..5.
    this._np = [1, 1 + 2 * p, 1 + 4 * p, 3 + 2 * p, 5];
  }

  get count(): number {
    return this._count;
  }

  /** Ingest one observation. O(1). */
  add(x: number): void {
    this._count++;
    if (!this._initialized) {
      this._q.push(x);
      if (this._q.length === 5) {
        this._q.sort((a, b) => a - b);
        this._initialized = true;
      }
      return;
    }

    // Locate the cell containing x (0-based markers q[0]..q[4]).
    let k: number;
    if (x < this._q[0]) {
      this._q[0] = x;
      k = 0;
    } else if (x >= this._q[4]) {
      this._q[4] = x;
      k = 3;
    } else {
      k = 0;
      while (k < 3 && x >= this._q[k + 1]) k++;
    }

    // Positions of markers above k shift right by one sample.
    for (let i = k + 1; i < 5; i++) this._n[i]++;
    // Desired positions drift by their increments.
    for (let i = 0; i < 5; i++) this._np[i] += this._dn[i];

    // Adjust interior markers (1..3) via P² parabolic or linear step.
    for (let i = 1; i <= 3; i++) {
      const d = this._np[i] - this._n[i];
      if ((d >= 1 && this._n[i + 1] - this._n[i] > 1) || (d <= -1 && this._n[i - 1] - this._n[i] < -1)) {
        const sign = d >= 1 ? 1 : -1;
        const candidate = this._parabolic(i, sign);
        if (this._q[i - 1] < candidate && candidate < this._q[i + 1]) {
          this._q[i] = candidate;
        } else {
          this._q[i] = this._linear(i, sign);
        }
        this._n[i] += sign;
      }
    }
  }

  /** Current quantile estimate. Meaningful once ≥5 samples ingested. */
  value(): number {
    if (this._q.length === 0) return Number.NaN;
    if (this._q.length < 5) {
      const idx = Math.min(this._q.length - 1, Math.floor(this._p * this._q.length));
      return this._q[idx];
    }
    return this._q[2];
  }

  private _parabolic(i: number, d: number): number {
    const q = this._q;
    const n = this._n;
    return (
      q[i] +
      (d / (n[i + 1] - n[i - 1])) *
        (((n[i] - n[i - 1] + d) * (q[i + 1] - q[i])) / (n[i + 1] - n[i]) +
          ((n[i + 1] - n[i] - d) * (q[i] - q[i - 1])) / (n[i] - n[i - 1]))
    );
  }

  private _linear(i: number, d: number): number {
    return this._q[i] + (d * (this._q[i + d] - this._q[i])) / (this._n[i + d] - this._n[i]);
  }
}

interface MetricSeries {
  readonly name: string;
  readonly stats: WelfordAccumulator;
  readonly p50: P2Quantile;
  readonly p95: P2Quantile;
  readonly p99: P2Quantile;
  /** Recent (t, v) for rate computation — ring buffer. */
  readonly recent: { at: number; value: number }[];
  readonly recentCap: number;
  min: number;
  max: number;
}

export interface MetricSummary {
  readonly name: string;
  readonly count: number;
  readonly mean: number;
  readonly stddev: number;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  /** Units per second over the retained window (NaN if <2 points). */
  readonly ratePerSec: number;
}

export class MetricStore {
  private readonly _clock: ChaosClock;
  private readonly _series = new Map<string, MetricSeries>();
  private readonly _recentCap: number;

  constructor(clock: ChaosClock = Date.now, recentCap = 512) {
    this._clock = clock;
    this._recentCap = recentCap;
  }

  /** Record one observation for `name`. O(1) amortized. */
  record(name: string, value: number): void {
    let s = this._series.get(name);
    if (!s) {
      s = {
        name,
        stats: new WelfordAccumulator(),
        p50: new P2Quantile(0.5),
        p95: new P2Quantile(0.95),
        p99: new P2Quantile(0.99),
        recent: [],
        recentCap: this._recentCap,
        min: value,
        max: value,
      };
      this._series.set(name, s);
    }
    s.stats.add(value);
    s.p50.add(value);
    s.p95.add(value);
    s.p99.add(value);
    if (value < s.min) s.min = value;
    if (value > s.max) s.max = value;
    s.recent.push({ at: this._clock(), value });
    if (s.recent.length > s.recentCap) {
      s.recent.splice(0, s.recent.length - s.recentCap);
    }
  }

  /** Full summary for a metric, or undefined if never recorded. */
  summarize(name: string): MetricSummary | undefined {
    const s = this._series.get(name);
    if (!s) return undefined;
    let rate = Number.NaN;
    if (s.recent.length >= 2) {
      const first = s.recent[0];
      const last = s.recent[s.recent.length - 1];
      const dt = last.at - first.at;
      if (dt > 0) rate = ((last.value - first.value) / dt) * 1000;
    }
    return {
      name,
      count: s.stats.count,
      mean: s.stats.mean,
      stddev: s.stats.stddev,
      min: s.min,
      max: s.max,
      p50: s.p50.value(),
      p95: s.p95.value(),
      p99: s.p99.value(),
      ratePerSec: rate,
    };
  }

  get names(): ReadonlyArray<string> {
    return [...this._series.keys()];
  }

  summarizeAll(): ReadonlyArray<MetricSummary> {
    const out: MetricSummary[] = [];
    for (const name of this._series.keys()) {
      const s = this.summarize(name);
      if (s) out.push(s);
    }
    return out;
  }

  reset(name?: string): void {
    if (name === undefined) this._series.clear();
    else this._series.delete(name);
  }
}
