/**
 * Canary Deploy — Analysis History & Trend Detection
 *
 * Stores per-step analysis verdicts over a rollout's lifetime and computes
 * trend signals the raw gate checks miss: a metric can be inside tolerance
 * every single window while monotonically degrading — "the canary is getting
 * steadily worse" is a rollback signal even when no single window breaches.
 *
 * Trend detection: least-squares slope over the last N windowed means plus
 * run-length counting (consecutive windows above/below baseline mean).
 * A regression is flagged when |slope| exceeds `slopeThreshold` AND the
 * regression direction is adverse for the metric, or when adverse-run length
 * exceeds `runLimit`.
 *
 * @module CanaryDeploy/Canary
 */

import { AnalysisResult, CanaryClock, GateVerdict } from './CanaryTypes';

export interface WindowSummary {
  readonly stepIndex: number;
  readonly at: number;
  readonly passed: boolean;
  /** gate name → canary observed value. */
  readonly values: ReadonlyMap<string, number>;
  /** gate name → baseline observed value. */
  readonly baselines: ReadonlyMap<string, number>;
}

export interface TrendSignal {
  readonly gate: string;
  readonly degrading: boolean;
  readonly slope: number;
  readonly adverseRunLength: number;
  readonly reason: string;
}

export class AnalysisHistory {
  private readonly _clock: CanaryClock;
  private readonly _windows: WindowSummary[] = [];

  constructor(clock: CanaryClock = Date.now) {
    this._clock = clock;
  }

  /** Record one analysis-window outcome. */
  record(result: AnalysisResult): void {
    const values = new Map<string, number>();
    const baselines = new Map<string, number>();
    for (const v of result.verdicts) {
      values.set(v.gate, v.canaryValue);
      baselines.set(v.gate, v.baselineValue);
    }
    this._windows.push({
      stepIndex: result.stepIndex,
      at: result.windowEnd,
      passed: result.passed,
      values,
      baselines,
    });
  }

  get windows(): ReadonlyArray<WindowSummary> {
    return this._windows;
  }

  /**
   * Trend for one gate across the last `n` windows. `higherIsWorse` selects
   * the adverse direction (true for error rate/latency/saturation).
   */
  trend(
    gate: string,
    n = 5,
    opts: { higherIsWorse?: boolean; slopeThreshold?: number; runLimit?: number } = {}
  ): TrendSignal | null {
    const higherIsWorse = opts.higherIsWorse ?? true;
    const slopeThreshold = opts.slopeThreshold ?? 0.05;
    const runLimit = opts.runLimit ?? 3;

    const points = this._windows
      .filter((w) => {
        const v = w.values.get(gate);
        return v !== undefined && !Number.isNaN(v);
      })
      .slice(-n);
    if (points.length < 3) return null;

    const xs = points.map((_, i) => i);
    const ys = points.map((w) => w.values.get(gate)!);
    const slope = leastSquaresSlope(xs, ys);

    // Adverse run: consecutive windows canary worse than baseline mean.
    let run = 0;
    for (let i = points.length - 1; i >= 0; i--) {
      const c = points[i].values.get(gate)!;
      const b = points[i].baselines.get(gate);
      const adverse = b === undefined ? false : higherIsWorse ? c > b : c < b;
      if (adverse) run++;
      else break;
    }

    const adverseSlope = higherIsWorse ? slope > slopeThreshold : slope < -slopeThreshold;
    const degrading = adverseSlope || run >= runLimit;
    return {
      gate,
      degrading,
      slope,
      adverseRunLength: run,
      reason: degrading
        ? adverseSlope
          ? `slope ${slope.toFixed(4)}/window exceeds ${slopeThreshold}`
          : `${run} consecutive adverse windows ≥ limit ${runLimit}`
        : 'stable',
    };
  }

  /** All degrading gates across the recent window history. */
  degrading(n = 5): ReadonlyArray<TrendSignal> {
    const gates = new Set<string>();
    for (const w of this._windows) {
      for (const g of w.values.keys()) gates.add(g);
    }
    const out: TrendSignal[] = [];
    for (const g of gates) {
      const t = this.trend(g, n);
      if (t?.degrading) out.push(t);
    }
    return out;
  }
}

/** Least-squares slope of y over x. O(n). */
export function leastSquaresSlope(xs: ReadonlyArray<number>, ys: ReadonlyArray<number>): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxy += xs[i] * ys[i];
    sxx += xs[i] * xs[i];
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}
