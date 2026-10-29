/**
 * Budget Tracking & Forecasting Engine
 *
 * Tracks spend records against period budgets and projects end-of-period
 * spend using two methods:
 *
 *  - **linear**: run-rate extrapolation —
 *    `spent / elapsed × periodLength`. Simple, reacts instantly, noisy
 *    early in the period.
 *  - **moving-average**: mean daily spend over the trailing N days,
 *    extrapolated over the remaining time —
 *    `spent + meanDaily × remainingDays`. Smoother, lags trend changes.
 *
 * @module CostOptimizationLayer/Engines
 */

import { Budget, BudgetStatus, DAY_MS, IClock, SpendRecord, SystemClock } from './types';

export interface BudgetEngineConfig {
  /** Forecast method. */
  method: 'linear' | 'moving-average';
  /** Trailing window (days) for the moving-average method. */
  movingAverageDays: number;
}

export class BudgetEngine {
  private readonly _budgets: Map<string, Budget>;
  /** costCenter -> spend records (appended, filtered on read). */
  private readonly _spend: Map<string, SpendRecord[]>;
  private readonly _config: BudgetEngineConfig;
  private readonly _clock: IClock;

  constructor(config: Partial<BudgetEngineConfig> = {}, clock: IClock = new SystemClock()) {
    this._budgets = new Map();
    this._spend = new Map();
    this._config = { method: 'linear', movingAverageDays: 7, ...config };
    this._clock = clock;
  }

  addBudget(budget: Budget): void {
    if (budget.limitCents <= 0) throw new Error('Budget limit must be positive');
    if (budget.periodMs <= 0) throw new Error('Budget period must be positive');
    this._budgets.set(budget.id, { ...budget });
  }

  removeBudget(budgetId: string): boolean {
    return this._budgets.delete(budgetId);
  }

  /** Record a spend event for a cost center. */
  recordSpend(record: SpendRecord): void {
    let arr = this._spend.get(record.costCenter);
    if (!arr) {
      arr = [];
      this._spend.set(record.costCenter, arr);
    }
    arr.push({ ...record });
  }

  /** Spend so far this period for a cost center, cents. */
  spendInPeriod(costCenter: string, periodStart: number, periodMs: number): number {
    const now = this._clock.now();
    const end = periodStart + periodMs;
    const arr = this._spend.get(costCenter) ?? [];
    let sum = 0;
    for (const r of arr) {
      if (r.timestamp >= periodStart && r.timestamp <= Math.min(end, now)) {
        sum += r.amountCents;
      }
    }
    return sum;
  }

  /**
   * Project end-of-period spend.
   *
   * linear:          spent × (periodMs / elapsedMs)
   * moving-average:  spent + mean(daily spend over window) × remainingDays
   */
  forecast(budgetId: string): number {
    const b = this._require(budgetId);
    const now = this._clock.now();
    const elapsed = Math.max(0, Math.min(now - b.periodStart, b.periodMs));
    const remaining = Math.max(0, b.periodStart + b.periodMs - now);
    const spent = this.spendInPeriod(b.costCenter, b.periodStart, b.periodMs);

    if (this._config.method === 'linear') {
      if (elapsed === 0) return 0;
      return spent * (b.periodMs / elapsed);
    }

    // moving-average: daily mean over the trailing N days within the period
    const windowStart = Math.max(b.periodStart, now - this._config.movingAverageDays * DAY_MS);
    const windowMs = now - windowStart;
    if (windowMs <= 0) return spent;
    const windowSpend = this._spendInRange(b.costCenter, windowStart, now);
    const meanPerMs = windowSpend / windowMs;
    return spent + meanPerMs * remaining;
  }

  /** Full status of a budget including forecast breach flag. */
  status(budgetId: string): BudgetStatus {
    const b = this._require(budgetId);
    const now = this._clock.now();
    const spent = this.spendInPeriod(b.costCenter, b.periodStart, b.periodMs);
    const remaining = Math.max(0, b.periodStart + b.periodMs - now);
    const forecastCents = this.forecast(budgetId);
    return {
      budgetId,
      spentCents: spent,
      limitCents: b.limitCents,
      usedPct: (spent / b.limitCents) * 100,
      remainingMs: remaining,
      forecastCents,
      forecastBreach: forecastCents > b.limitCents,
      method: this._config.method,
    };
  }

  /** All budgets whose forecast exceeds their limit. */
  breaching(): BudgetStatus[] {
    return [...this._budgets.keys()].map((id) => this.status(id)).filter((s) => s.forecastBreach);
  }

  /**
   * Roll a budget into its next period: advances periodStart by whole
   * periods until the current period contains `now`.
   */
  rollPeriods(): number {
    const now = this._clock.now();
    let rolled = 0;
    for (const b of this._budgets.values()) {
      while (now >= b.periodStart + b.periodMs) {
        b.periodStart += b.periodMs;
        rolled++;
      }
    }
    return rolled;
  }

  private _spendInRange(costCenter: string, from: number, to: number): number {
    const arr = this._spend.get(costCenter) ?? [];
    let sum = 0;
    for (const r of arr) {
      if (r.timestamp >= from && r.timestamp <= to) sum += r.amountCents;
    }
    return sum;
  }

  private _require(budgetId: string): Budget {
    const b = this._budgets.get(budgetId);
    if (!b) throw new Error(`Unknown budget: ${budgetId}`);
    return b;
  }
}
