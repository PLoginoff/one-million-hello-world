/**
 * Canary Deploy — Metric Analyzer
 *
 * Statistical comparison of canary vs baseline metric samples. Three gate
 * modes:
 *
 * - `absolute`   — canary metric mean ≤ fixed threshold.
 * - `relative`   — canary mean ≤ baseline mean × (1 + toleranceRatio).
 * - `statistical`— two-sided Welch t-test: the canary must NOT be
 *   significantly *worse* (larger) than baseline at the configured alpha.
 *   For "higher is worse" metrics (error rate, latency, saturation) the
 *   gate fails when canary_mean > baseline_mean AND the difference is
 *   significant at `alpha`.
 *
 * The Welch t critical value uses a normal approximation for df ≥ 30 and a
 * lookup table for small df — dependency-free and accurate to ~2 decimal
 * places, sufficient for gating decisions.
 *
 * Samples are stored per (metric, cohort) in bounded ring buffers.
 *
 * @module CanaryDeploy/Canary
 */

import { CanaryClock, CanaryMetricKind, GateVerdict, MetricGate, MetricObservation } from './CanaryTypes';

/** Two-sample Welford stats. */
export class SampleStats {
  private _n = 0;
  private _mean = 0;
  private _m2 = 0;

  get n(): number { return this._n; }
  get mean(): number { return this._mean; }
  get variance(): number { return this._n > 1 ? this._m2 / (this._n - 1) : 0; }
  get stddev(): number { return Math.sqrt(this.variance); }

  add(x: number): void {
    this._n++;
    const d = x - this._mean;
    this._mean += d / this._n;
    this._m2 += d * (x - this._mean);
  }
}

/** Approximate two-sided t critical value for alpha and df. */
export function tCritical(alpha: number, df: number): number {
  // Small-df table for common alphas (two-sided). df beyond table → normal approx.
  const table: Record<number, number[]> = {
    // alpha: 0.10, 0.05, 0.02, 0.01
    1: [6.314, 12.706, 31.821, 63.657],
    2: [2.920, 4.303, 6.965, 9.925],
    3: [2.353, 3.182, 4.541, 5.841],
    4: [2.132, 2.776, 3.747, 4.604],
    5: [2.015, 2.571, 3.365, 4.032],
    6: [1.943, 2.447, 3.143, 3.707],
    7: [1.895, 2.365, 2.998, 3.499],
    8: [1.860, 2.306, 2.896, 3.355],
    9: [1.833, 2.262, 2.821, 3.250],
    10: [1.812, 2.228, 2.764, 3.169],
    15: [1.753, 2.131, 2.602, 2.947],
    20: [1.725, 2.086, 2.528, 2.845],
    25: [1.708, 2.060, 2.485, 2.787],
    30: [1.697, 2.042, 2.457, 2.750],
  };
  const alphaIdx = alpha <= 0.01 ? 3 : alpha <= 0.02 ? 2 : alpha <= 0.05 ? 1 : 0;
  if (df >= 1 && df <= 10) return table[Math.floor(df)][alphaIdx];
  if (df <= 30) {
    const keys = [15, 20, 25, 30];
    const k = keys.find((x) => df <= x) ?? 30;
    return table[k][alphaIdx];
  }
  // Normal approximation for df > 30.
  const z = alpha <= 0.01 ? 2.576 : alpha <= 0.02 ? 2.326 : alpha <= 0.05 ? 1.96 : 1.645;
  return z;
}

interface CohortKey {
  metric: string;
  cohort: 'baseline' | 'canary';
}

interface Series {
  samples: MetricObservation[];
  stats: SampleStats;
}

export class CanaryAnalyzer {
  private readonly _clock: CanaryClock;
  private readonly _series = new Map<string, Series>();
  private readonly _maxSamples: number;

  constructor(clock: CanaryClock = Date.now, maxSamplesPerSeries = 10_000) {
    this._clock = clock;
    this._maxSamples = maxSamplesPerSeries;
  }

  private _key(metric: CanaryMetricKind | string, cohort: 'baseline' | 'canary'): string {
    return `${cohort}:${metric}`;
  }

  private _seriesFor(k: CohortKey): Series {
    const id = `${k.cohort}:${k.metric}`;
    let s = this._series.get(id);
    if (!s) {
      s = { samples: [], stats: new SampleStats() };
      this._series.set(id, s);
    }
    return s;
  }

  /** Record one observation. */
  record(metric: CanaryMetricKind | string, cohort: 'baseline' | 'canary', value: number): void {
    const s = this._seriesFor({ metric: String(metric), cohort });
    s.samples.push({ at: this._clock(), value });
    s.stats.add(value);
    if (s.samples.length > this._maxSamples) {
      // Rebuild stats after dropping the oldest quarter — O(n) occasionally,
      // amortized O(1).
      s.samples.splice(0, Math.floor(this._maxSamples / 4));
      const st = new SampleStats();
      for (const smp of s.samples) st.add(smp.value);
      s.stats = st;
    }
  }

  /** Snapshot stats for a cohort; undefined when no samples yet. */
  statsFor(metric: CanaryMetricKind | string, cohort: 'baseline' | 'canary'): SampleStats | undefined {
    const s = this._series.get(this._key(metric, cohort));
    return s && s.stats.n > 0 ? s.stats : undefined;
  }

  /** Raw samples in a time window for a cohort (for windowed gates). */
  windowSamples(
    metric: CanaryMetricKind | string,
    cohort: 'baseline' | 'canary',
    windowMs: number
  ): MetricObservation[] {
    const s = this._series.get(this._key(metric, cohort));
    if (!s) return [];
    const cutoff = this._clock() - windowMs;
    return s.samples.filter((x) => x.at >= cutoff);
  }

  /**
   * Evaluate one gate over a rolling window. `windowMs` selects the most
   * recent samples; `minSamples` applies per cohort within the window.
   */
  evaluateGate(gate: MetricGate, windowMs: number): GateVerdict {
    const metricName = gate.metric === 'custom' ? (gate.customName ?? 'custom') : gate.metric;
    const canaryObs = this.windowSamples(metricName, 'canary', windowMs);
    const baselineObs = this.windowSamples(metricName, 'baseline', windowMs);

    if (canaryObs.length < gate.minSamples || baselineObs.length < gate.minSamples) {
      return {
        gate: gate.name,
        passed: false,
        score: 0,
        canaryValue: Number.NaN,
        baselineValue: Number.NaN,
        reason: `insufficient samples c=${canaryObs.length} b=${baselineObs.length} need ${gate.minSamples}`,
      };
    }

    const c = new SampleStats();
    canaryObs.forEach((o) => c.add(o.value));
    const b = new SampleStats();
    baselineObs.forEach((o) => b.add(o.value));

    switch (gate.mode) {
      case 'absolute': {
        const thr = gate.threshold ?? Number.POSITIVE_INFINITY;
        const ok = c.mean <= thr;
        return {
          gate: gate.name,
          passed: ok,
          score: thr > 0 ? c.mean / thr : 0,
          canaryValue: c.mean,
          baselineValue: b.mean,
          reason: ok ? `${c.mean.toFixed(4)} ≤ ${thr}` : `${c.mean.toFixed(4)} > ${thr}`,
        };
      }
      case 'relative': {
        const tol = gate.toleranceRatio ?? 0;
        const limit = b.mean * (1 + tol);
        const ok = c.mean <= limit;
        return {
          gate: gate.name,
          passed: ok,
          score: limit !== 0 ? c.mean / limit : 0,
          canaryValue: c.mean,
          baselineValue: b.mean,
          reason: ok
            ? `${c.mean.toFixed(4)} ≤ baseline×(1+${tol})=${limit.toFixed(4)}`
            : `${c.mean.toFixed(4)} > ${limit.toFixed(4)}`,
        };
      }
      case 'statistical': {
        const alpha = gate.alpha ?? 0.05;
        const res = welchTTest(b, c);
        if (!res) {
          return {
            gate: gate.name,
            passed: c.mean <= b.mean,
            score: 0,
            canaryValue: c.mean,
            baselineValue: b.mean,
            reason: 'degenerate distributions',
          };
        }
        const crit = tCritical(alpha, res.df);
        const significant = Math.abs(res.t) > crit;
        const worse = c.mean > b.mean;
        const passed = !(significant && worse);
        // Approximate one-sided p-value from |t|.
        const pValue = approxPValue(Math.abs(res.t), res.df);
        return {
          gate: gate.name,
          passed,
          score: pValue,
          canaryValue: c.mean,
          baselineValue: b.mean,
          pValue,
          reason: passed
            ? `t=${res.t.toFixed(2)} (crit ${crit.toFixed(2)}) — no significant regression`
            : `canary significantly worse: t=${res.t.toFixed(2)} > ${crit.toFixed(2)}`,
        };
      }
    }
  }

  /** Evaluate every gate; all must pass for the window to pass. */
  evaluateAll(gates: ReadonlyArray<MetricGate>, windowMs: number): {
    passed: boolean;
    verdicts: GateVerdict[];
  } {
    const verdicts = gates.map((g) => this.evaluateGate(g, windowMs));
    return { passed: verdicts.every((v) => v.passed), verdicts };
  }

  /** Drop all recorded data (e.g. between rollouts). */
  reset(): void {
    this._series.clear();
  }
}

/**
 * Welch's two-sample t-test. Returns { t, df } or null when variance is
 * degenerate (both series constant).
 */
export function welchTTest(a: SampleStats, b: SampleStats): { t: number; df: number } | null {
  if (a.n < 2 || b.n < 2) return null;
  const va = a.variance;
  const vb = b.variance;
  const se2 = va / a.n + vb / b.n;
  if (se2 === 0) {
    return a.mean === b.mean ? { t: 0, df: a.n + b.n - 2 } : null;
  }
  const t = (b.mean - a.mean) / Math.sqrt(se2);
  const df =
    se2 * se2 /
    ((va / a.n) * (va / a.n) / (a.n - 1) + (vb / b.n) * (vb / b.n) / (b.n - 1));
  return { t, df };
}

/**
 * Rough two-sided p-value approximation from |t| using the normal tail for
 * large df and a conservative scaling for small df. Accurate enough for
 * gate scoring (reported, not used for pass/fail — critical value does that).
 */
export function approxPValue(tAbs: number, df: number): number {
  // Hill's approximation would be more accurate; for gating we use a
  // simple sigmoid blend between the normal tail and a small-df correction.
  const z = tAbs * Math.sqrt(df / (df + tAbs * tAbs)); // t→z for moderate df
  const tail = 0.5 * erfc(z / Math.SQRT2);
  return Math.min(1, Math.max(0, 2 * tail));
}

/** Complementary error function (Abramowitz–Stegun 7.1.26, |ε| ≤ 1.5e-7). */
export function erfc(x: number): number {
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const tau =
    t *
    Math.exp(
      -x * x -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? tau : 2 - tau;
}
