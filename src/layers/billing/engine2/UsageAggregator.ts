/**
 * Usage-Based Aggregation with Tiered Overage
 *
 * Rolls raw usage events up into billing quantities, then prices them
 * against tier schedules — including the *overage* case the basic
 * pricing engine doesn't model: an included base allowance, tiered
 * per-unit pricing above it, and an optional hard cap that converts
 * overage into throttling instead of charges.
 *
 * Aggregation buckets events by (customer, meter, period) with sum /
 * max / last semantics per meter definition.
 *
 * Money stays in minor units; tier math is exact integer arithmetic.
 *
 * @module BillingLayer/Engine2
 */

import type { Money } from './CreditNotes';

export type MeterKind = 'sum' | 'max' | 'last';

export interface UsageEvent2 {
  readonly customerId: string;
  readonly meter: string;
  readonly quantity: number;
  readonly timestampMs: number;
}

export interface OverageTier {
  /** Inclusive lower bound of billable units in this tier. */
  readonly from: number;
  /** Exclusive upper bound; undefined = unbounded last tier. */
  readonly to?: number;
  /** Price per unit in minor units. */
  readonly unitPrice: Money;
}

export interface MeterRate {
  readonly meter: string;
  /** Units included free per period before charging starts. */
  readonly includedUnits: number;
  readonly tiers: readonly OverageTier[];
  /** Hard cap: usage above this is not billed (throttled upstream). */
  readonly hardCap?: number;
  readonly kind?: MeterKind;
}

export interface AggregateResult {
  readonly customerId: string;
  readonly meter: string;
  readonly periodStartMs: number;
  readonly periodEndMs: number;
  /** Raw aggregated quantity in the period. */
  readonly rawQuantity: number;
  /** Quantity billed after the included allowance and hard cap. */
  readonly billableQuantity: number;
  /** Units suppressed by the hard cap (excluded from billing). */
  readonly cappedQuantity: number;
  /** Cost in minor units, summed per tier slice. */
  readonly amount: Money;
  /** Per-tier breakdown for invoice line items. */
  readonly breakdown: readonly {
    tierFrom: number;
    tierTo?: number;
    units: number;
    unitPrice: Money;
    amount: Money;
  }[];
}

export class UsageAggregator {
  /**
   * Aggregate `events` for `customerId`+`meter` inside `[fromMs, toMs)`,
   * then price the overage tiers. Events outside the window are ignored.
   */
  aggregate(
    customerId: string,
    meter: MeterRate,
    events: readonly UsageEvent2[],
    fromMs: number,
    toMs: number
  ): AggregateResult {
    const kind = meter.kind ?? 'sum';
    let raw = kind === 'sum' ? 0 : Number.NEGATIVE_INFINITY;
    let lastTs = -1;
    let lastQty = 0;

    for (const e of events) {
      if (e.customerId !== customerId || e.meter !== meter.meter) continue;
      if (e.timestampMs < fromMs || e.timestampMs >= toMs) continue;
      switch (kind) {
        case 'sum':
          raw += e.quantity;
          break;
        case 'max':
          raw = Math.max(raw, e.quantity);
          break;
        case 'last':
          if (e.timestampMs >= lastTs) {
            lastTs = e.timestampMs;
            lastQty = e.quantity;
          }
          break;
      }
    }
    if (kind === 'last') raw = lastTs === -1 ? 0 : lastQty;
    if (!Number.isFinite(raw)) raw = 0;

    return this.price(customerId, meter, raw, fromMs, toMs);
  }

  /**
   * Price a raw quantity against the meter: subtract the included
   * allowance, apply the hard cap, then walk the tier schedule.
   */
  price(
    customerId: string,
    meter: MeterRate,
    rawQuantity: number,
    periodStartMs: number,
    periodEndMs: number
  ): AggregateResult {
    const included = Math.max(0, meter.includedUnits);
    const over = Math.max(0, rawQuantity - included);
    const capped = meter.hardCap !== undefined ? Math.max(0, over - meter.hardCap) : 0;
    const billable = over - capped;

    // Walk contiguous tiers: tier `i` covers [from, to).
    const breakdown: {
      tierFrom: number;
      tierTo?: number;
      units: number;
      unitPrice: Money;
      amount: Money;
    }[] = [];
    let remaining = billable;
    let amount = 0;
    for (const t of meter.tiers) {
      if (remaining <= 0) break;
      const width = t.to === undefined ? remaining : Math.min(remaining, t.to - t.from);
      if (width <= 0) continue;
      const sliceAmount = width * t.unitPrice;
      breakdown.push({
        tierFrom: t.from,
        tierTo: t.to,
        units: width,
        unitPrice: t.unitPrice,
        amount: sliceAmount,
      });
      amount += sliceAmount;
      remaining -= width;
    }

    return {
      customerId,
      meter: meter.meter,
      periodStartMs,
      periodEndMs,
      rawQuantity,
      billableQuantity: billable,
      cappedQuantity: capped,
      amount,
      breakdown,
    };
  }

  /**
   * Validate a tier schedule: contiguous, ascending, starting at 0.
   * Call at config load time rather than per-invoice.
   */
  static validateTiers(tiers: readonly OverageTier[]): void {
    if (tiers.length === 0) throw new Error('overage tiers must not be empty');
    if (tiers[0].from !== 0) throw new Error('first tier must start at 0');
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const isLast = i === tiers.length - 1;
      if (t.to === undefined && !isLast) {
        throw new Error(`tier ${i} unbounded but not last`);
      }
      if (!isLast && tiers[i + 1].from !== t.to) {
        throw new Error(`tier ${i + 1} starts at ${tiers[i + 1].from}, expected ${t.to}`);
      }
    }
  }
}
