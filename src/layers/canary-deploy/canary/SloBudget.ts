/**
 * Canary Deploy — SLO Error-Budget Tracker
 *
 * Tracks the rollout's consumption of the service's error budget. Canary
 * rollouts don't just need "is the canary bad" — they need "how much of our
 * monthly error budget did this canary burn?" A canary that technically
 * passes gates but torches 40% of the error budget should still roll back.
 *
 * Model: the SLO defines an allowed error fraction (1 − sloTarget). Budget
 * = sloTarget's complement × total requests. Burn rate is observed errors
 * normalized by allowed errors — >1 is burning faster than sustainable
 * (classic SRE multiwindow burn-rate alerting, single-window simplified).
 *
 * @module CanaryDeploy/Canary
 */

import { CanaryClock } from './CanaryTypes';

export interface SloDefinition {
  /** Target success ratio (e.g. 0.999 = 99.9%). */
  readonly target: number;
  /** Window the budget applies to (ms) — e.g. 30 days. */
  readonly windowMs: number;
}

export interface BurnStatus {
  /** Errors observed ÷ errors the SLO allows in the observed window. */
  readonly burnRate: number;
  /** Fraction of the total error budget consumed (can exceed 1). */
  readonly budgetConsumed: number;
  readonly observedErrors: number;
  readonly observedTotal: number;
  readonly allowedErrors: number;
  /** True when burning faster than the SLO sustains. */
  readonly exceeding: boolean;
}

export class SloBudget {
  private readonly _slo: SloDefinition;
  private readonly _clock: CanaryClock;
  private _errors = 0;
  private _total = 0;
  private _startedAt: number;

  constructor(slo: SloDefinition, clock: CanaryClock = Date.now) {
    if (!(slo.target > 0 && slo.target < 1)) throw new RangeError('slo.target must be in (0,1)');
    this._slo = slo;
    this._clock = clock;
    this._startedAt = clock();
  }

  /** Record request outcomes. */
  record(errors: number, total: number): void {
    if (total <= 0) return;
    this._errors += errors;
    this._total += total;
  }

  /**
   * Current burn status. `allowedErrors` prorates the SLO's error fraction
   * over elapsed fraction of the window — early in the window the allowed
   * absolute error count is small, making burn spikes detectable fast.
   */
  status(): BurnStatus {
    const allowedFraction = 1 - this._slo.target;
    // Prorate: the window's full budget is allowedFraction × (total requests
    // expected in the window) — but since we can't know the total upfront we
    // scale by observed total: allowed errors in what we've seen so far.
    const allowedErrors = this._total * allowedFraction;
    const burnRate = allowedErrors > 0 ? this._errors / allowedErrors : this._errors > 0 ? Number.POSITIVE_INFINITY : 0;
    const elapsed = this._clock() - this._startedAt;
    const windowFraction = this._slo.windowMs > 0 ? Math.min(1, elapsed / this._slo.windowMs) : 1;
    const budgetConsumed = windowFraction > 0 ? burnRate * windowFraction : burnRate;
    return {
      burnRate,
      budgetConsumed,
      observedErrors: this._errors,
      observedTotal: this._total,
      allowedErrors,
      exceeding: burnRate > 1,
    };
  }

  /** Remaining error budget in absolute errors for the observed volume. */
  remainingBudgetErrors(): number {
    const allowed = this._total * (1 - this._slo.target);
    return Math.max(0, allowed - this._errors);
  }

  reset(): void {
    this._errors = 0;
    this._total = 0;
    this._startedAt = this._clock();
  }
}
