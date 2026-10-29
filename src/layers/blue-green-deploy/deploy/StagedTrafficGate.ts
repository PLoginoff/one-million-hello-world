/**
 * Blue-Green Deploy — Staged Traffic Gate
 *
 * A hybrid "canary inside blue-green" control: rather than a binary
 * instant/gradual choice, each traffic step must earn the next step by
 * beating per-step SLO budgets (max error budget burn rate + min soak time).
 * This is how production blue-green systems actually de-risk cutovers —
 * each plateau is a checkpoint, not just a timer.
 *
 * The gate maintains a per-step error budget: `budgetFraction` of requests
 * may error before the step is failed. Burn rate is observed-vs-allowed
 * errors; a step may only advance when soak elapses AND burn < 1.0.
 *
 * @module BlueGreenDeploy/Deploy
 */

import { BgClock } from './BlueGreenTypes';

export interface StepBudget {
  /** Fraction of requests allowed to error at this step (0..1). */
  readonly budgetFraction: number;
  /** Minimum soak before the step may advance (ms). */
  readonly minSoakMs: number;
}

export interface StepEvaluation {
  readonly mayAdvance: boolean;
  readonly burnRate: number;
  readonly observedErrors: number;
  readonly observedTotal: number;
  readonly soakRemainingMs: number;
}

export class StagedTrafficGate {
  private readonly _clock: BgClock;
  private readonly _budgets: ReadonlyArray<StepBudget>;
  private _stepIndex = 0;
  private _stepStartedAt = 0;
  private _errors = 0;
  private _total = 0;

  constructor(budgets: ReadonlyArray<StepBudget>, clock: BgClock = Date.now) {
    if (budgets.length === 0) throw new Error('at least one step budget required');
    for (const b of budgets) {
      if (!(b.budgetFraction >= 0 && b.budgetFraction <= 1)) {
        throw new RangeError('budgetFraction must be in [0,1]');
      }
    }
    this._budgets = budgets;
    this._clock = clock;
    this._stepStartedAt = clock();
  }

  get stepIndex(): number {
    return this._stepIndex;
  }

  /** Record request outcomes at the current step. */
  observe(errors: number, total: number): void {
    this._errors += errors;
    this._total += total;
  }

  /**
   * Evaluate the current step: may it advance? Requires minimum soak AND
   * burn rate < 1 (observed errors under budget).
   */
  evaluate(): StepEvaluation {
    const budget = this._budgets[this._stepIndex];
    const soakRemaining = Math.max(0, budget.minSoakMs - (this._clock() - this._stepStartedAt));
    const allowed = this._total * budget.budgetFraction;
    const burn = allowed > 0 ? this._errors / allowed : this._errors > 0 ? Number.POSITIVE_INFINITY : 0;
    return {
      mayAdvance: soakRemaining === 0 && burn < 1,
      burnRate: burn,
      observedErrors: this._errors,
      observedTotal: this._total,
      soakRemainingMs: soakRemaining,
    };
  }

  /** Advance to the next step (resets counters). Returns false when done. */
  advance(): boolean {
    if (this._stepIndex >= this._budgets.length - 1) return false;
    this._stepIndex++;
    this._stepStartedAt = this._clock();
    this._errors = 0;
    this._total = 0;
    return true;
  }

  /** Whether the last step has been reached and passed. */
  get exhausted(): boolean {
    return this._stepIndex === this._budgets.length - 1 && this.evaluate().mayAdvance;
  }
}
