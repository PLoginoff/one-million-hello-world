/**
 * Canary Step Analyzer
 *
 * Between full blue and full green is the graduated path: shift
 * traffic in steps, validate each, and advance or hold. Unlike the
 * one-shot `compareWindows` call, a canary needs *per-step* evidence —
 * the failure mode "green is fine at 5% and terrible at 50%" only
 * shows up when each step gets its own windowed comparison.
 *
 * `advance(decision)` applies a step's verdict; the analyzer keeps the
 * history so `halt` can distinguish "stop — green degraded at 30%"
 * from "keep going — noise on a small sample" (small windows use the
 * same min-requests floor as the one-shot analysis).
 *
 * @module BlueGreenDeployLayer/Engine2
 */

import { TrafficComparison, TrafficWindow } from './types';
import { compareWindows, TrafficPolicy } from './TrafficAnalysis';

export interface CanaryStep {
  /** Share of total traffic this step sends to green, 0..1. */
  readonly share: number;
  /** Wall-clock ms to hold the step before judging. */
  readonly holdMs: number;
}

export interface StepVerdict {
  readonly stepIndex: number;
  readonly share: number;
  readonly comparison: TrafficComparison;
  readonly proceed: boolean;
  readonly reason: string;
}

export interface CanaryReport {
  readonly ok: boolean;
  /** Highest share green safely reached. */
  readonly reachedShare: number;
  readonly verdicts: readonly StepVerdict[];
  readonly halted: boolean;
  readonly haltReason?: string;
}

export class CanaryAnalyzer {
  private readonly _steps: readonly CanaryStep[];
  private readonly _policy: Partial<TrafficPolicy>;

  constructor(steps: readonly CanaryStep[], policy: Partial<TrafficPolicy> = {}) {
    if (steps.length === 0) throw new Error('canary needs at least one step');
    for (const s of steps) {
      if (s.share <= 0 || s.share > 1) throw new Error(`step share must be in (0,1]: ${s.share}`);
      if (s.holdMs <= 0) throw new Error(`step holdMs must be positive: ${s.holdMs}`);
    }
    this._steps = steps;
    this._policy = policy;
  }

  get steps(): readonly CanaryStep[] {
    return this._steps;
  }

  /**
   * Evaluate the canary end-to-end. `sample(share)` returns the traffic
   * windows for the current step's hold period — the caller gathers
   * them (real sampler or stub). Steps advance only on a proceed
   * verdict; the first green-worse step halts and reports.
   */
  analyze(
    sample: (step: CanaryStep, index: number) => { blue: TrafficWindow; green: TrafficWindow }
  ): CanaryReport {
    const verdicts: StepVerdict[] = [];
    let reachedShare = 0;
    let halted = false;
    let haltReason: string | undefined;

    for (let i = 0; i < this._steps.length; i++) {
      const step = this._steps[i];
      if (step === undefined) break;
      const windows = sample(step, i);
      const comparison = compareWindows(windows.blue, windows.green, this._policy);
      const proceed = !comparison.greenWorse;
      verdicts.push({
        stepIndex: i,
        share: step.share,
        comparison,
        proceed,
        reason: comparison.reason,
      });
      if (proceed) {
        reachedShare = step.share;
      } else {
        halted = true;
        haltReason = `step ${i} (share ${step.share}): ${comparison.reason}`;
        break;
      }
    }

    return {
      ok: !halted,
      reachedShare,
      verdicts,
      halted,
      haltReason,
    };
  }
}
