/**
 * Canary Deploy — Step Planner
 *
 * Builds the progression of traffic weights a canary passes through. The
 * default plan is the industry-standard 5→10→25→50→100, but both the step
 * list and the per-step analysis time are configurable.
 *
 * Properties enforced at construction:
 * - strictly increasing weights, each in (0, 100], ending at 100
 *   (a plan that doesn't reach 100 is a partial rollout — rejected);
 * - every step has a positive analysis window.
 *
 * The planner also supports *halving* an in-flight plan for rollback-lite:
 * given a current step, `planBackOff` produces the sequence to retreat.
 *
 * @module CanaryDeploy/Canary
 */

import { CanaryStep } from './CanaryTypes';

export class StepPlanner {
  private readonly _steps: ReadonlyArray<CanaryStep>;

  constructor(steps: ReadonlyArray<CanaryStep>) {
    if (steps.length === 0) {
      throw new Error('step plan must have at least one step');
    }
    let prev = 0;
    for (const s of steps) {
      if (!(s.weightPercent > prev && s.weightPercent <= 100)) {
        throw new RangeError(
          `weights must be strictly increasing in (0,100]; got ${s.weightPercent} after ${prev}`
        );
      }
      if (s.analysisMs <= 0) {
        throw new RangeError('analysisMs must be positive');
      }
      prev = s.weightPercent;
    }
    if (steps[steps.length - 1].weightPercent !== 100) {
      throw new RangeError('final step must reach 100% — a canary plan is not a partial rollout');
    }
    this._steps = steps;
  }

  /** The classic 5→10→25→50→100 progression. */
  static standard(analysisMsPerStep = 60_000): StepPlanner {
    return new StepPlanner(
      [5, 10, 25, 50, 100].map((w) => ({ weightPercent: w, analysisMs: analysisMsPerStep }))
    );
  }

  /** Evenly-spaced plan: `n` steps of `100/n` each. */
  static linear(n: number, analysisMsPerStep = 60_000): StepPlanner {
    if (n < 1) throw new RangeError('n must be ≥ 1');
    const weights: number[] = [];
    for (let i = 1; i <= n; i++) weights.push(Math.round((100 * i) / n));
    weights[weights.length - 1] = 100; // guard rounding
    return new StepPlanner(weights.map((w) => ({ weightPercent: w, analysisMs: analysisMsPerStep })));
  }

  get steps(): ReadonlyArray<CanaryStep> {
    return this._steps;
  }

  get stepCount(): number {
    return this._steps.length;
  }

  stepAt(index: number): CanaryStep {
    const s = this._steps[index];
    if (!s) throw new RangeError(`step ${index} out of range (0..${this._steps.length - 1})`);
    return s;
  }

  /** Total soak time across all steps (excludes transition time). */
  totalAnalysisMs(): number {
    return this._steps.reduce((a, s) => a + s.analysisMs, 0);
  }

  /**
   * Back-off plan from a given step: halves the weight each step down to 0,
   * used for "soft" rollback that reduces rather than cuts traffic.
   */
  planBackOff(fromIndex: number, analysisMs = 30_000): CanaryStep[] {
    const start = this.stepAt(fromIndex).weightPercent;
    const out: CanaryStep[] = [];
    let w = Math.floor(start / 2);
    while (w > 0) {
      out.push({ weightPercent: w, analysisMs });
      w = Math.floor(w / 2);
    }
    return out;
  }
}
