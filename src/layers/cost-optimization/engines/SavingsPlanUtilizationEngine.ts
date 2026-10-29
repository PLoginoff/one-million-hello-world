/**
 * Savings Plan Utilization Engine
 *
 * Tracks committed-use discount plans (AWS Savings Plan style): you
 * commit to X cents/hour of eligible spend; usage below the commitment
 * is wasted money, usage above it is billed on-demand.
 *
 * Utilization over a window = consumed / committed × 100.
 * - < 100% → paying for unused commitment (waste)
 * - = 100% → perfect utilization
 * - > 100% → impossible by construction here: consumption is capped at
 *   the commitment per hour-slot, excess is on-demand (not waste).
 *
 * Hour-slot bucketing: consumption per slot is
 * min(eligibleSpendInSlot, commitmentPerHour), so a plan can't "bank"
 * unused commitment across hours — matching real savings-plan semantics.
 *
 * @module CostOptimizationLayer/Engines
 */

import { HOUR_MS, IClock, PlanUtilizationReport, SavingsPlanUsage, SystemClock } from './types';

export class SavingsPlanUtilizationEngine {
  private readonly _plans: Map<string, SavingsPlanUsage>;
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._plans = new Map();
    this._clock = clock;
  }

  /** Register a savings plan with an hourly commitment (cents/hour). */
  registerPlan(planId: string, commitmentCentsPerHour: number): void {
    if (commitmentCentsPerHour <= 0) {
      throw new Error('Commitment must be positive');
    }
    this._plans.set(planId, {
      planId,
      commitmentCentsPerHour,
      usage: [],
    });
  }

  /**
   * Record eligible spend (cents) at a timestamp. Multiple records in the
   * same hour-slot are summed, then capped at the hourly commitment when
   * utilization is computed.
   */
  recordUsage(planId: string, timestamp: number, eligibleSpendCents: number): void {
    const plan = this._require(planId);
    if (eligibleSpendCents < 0) throw new Error('Spend must be >= 0');
    plan.usage.push({ timestamp, consumedCents: eligibleSpendCents });
  }

  /**
   * Utilization over the trailing `windowMs` (default: since earliest
   * usage or now, whichever window covers).
   *
   * For each hour-slot overlapping the window:
   *   consumed += min(eligibleSpendInSlot, commitmentPerHour)
   *   committed += commitmentPerHour × (fraction of slot inside window)
   */
  report(planId: string, windowMs: number): PlanUtilizationReport {
    const plan = this._require(planId);
    const now = this._clock.now();
    const windowStart = now - windowMs;

    // Group eligible spend by hour-slot.
    const slots = new Map<number, number>();
    for (const u of plan.usage) {
      if (u.timestamp < windowStart || u.timestamp > now) continue;
      const slot = Math.floor(u.timestamp / HOUR_MS);
      slots.set(slot, (slots.get(slot) ?? 0) + u.consumedCents);
    }

    let committed = 0;
    let consumed = 0;

    // Iterate every hour-slot in the window — commitment accrues whether
    // or not usage occurred (that's the whole point of a commitment).
    const firstSlot = Math.floor(windowStart / HOUR_MS);
    const lastSlot = Math.floor(now / HOUR_MS);
    for (let slot = firstSlot; slot <= lastSlot; slot++) {
      const slotStart = Math.max(slot * HOUR_MS, windowStart);
      const slotEnd = Math.min((slot + 1) * HOUR_MS, now);
      if (slotEnd <= slotStart) continue;
      const fraction = (slotEnd - slotStart) / HOUR_MS;
      committed += plan.commitmentCentsPerHour * fraction;
      const eligible = slots.get(slot) ?? 0;
      consumed += Math.min(eligible, plan.commitmentCentsPerHour * fraction);
    }

    const utilizationPct = committed === 0 ? 0 : (consumed / committed) * 100;
    return {
      planId,
      windowMs,
      committedCents: committed,
      consumedCents: consumed,
      utilizationPct,
      wastedCents: Math.max(0, committed - consumed),
    };
  }

  /** Plans sorted by wasted commitment descending — the optimization queue. */
  worstUtilized(windowMs: number): PlanUtilizationReport[] {
    return [...this._plans.keys()]
      .map((id) => this.report(id, windowMs))
      .sort((a, b) => b.wastedCents - a.wastedCents);
  }

  private _require(planId: string): SavingsPlanUsage {
    const p = this._plans.get(planId);
    if (!p) throw new Error(`Unknown savings plan: ${planId}`);
    return p;
  }
}
