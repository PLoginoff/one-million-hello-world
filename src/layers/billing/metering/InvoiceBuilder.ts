/**
 * Invoice Builder
 *
 * Assembles {@link Invoice}s from usage aggregates + plans. Grouping rules:
 *  - one line per (meter, dimensions) bucket from the UsageMeter
 *  - proration adjustments appended as dedicated lines flagged isProration
 *  - free allowance already applied by the PricingEngine
 *
 * Credits from the {@link CreditLedger} are consumed at `finalize()` time so
 * `amountDueCents` reflects what the customer actually owes.
 *
 * @module BillingLayer/Metering
 */

import {
  BillingPeriod,
  Invoice,
  InvoiceLine,
  MeteringError,
  Plan,
  ProrationResult,
} from './BillingTypes';
import { billableQuantity, priceQuantity, validatePlan } from './PricingEngine';
import { UsageMeter } from './UsageMeter';
import { CreditLedger } from './CreditLedger';

export class InvoiceBuilder {
  private readonly _lines: InvoiceLine[] = [];
  private _finalized = false;

  constructor(
    private readonly _meter: UsageMeter,
    private readonly _ledger: CreditLedger,
    private readonly _invoiceId: string,
    private readonly _customerId: string,
    private readonly _period: BillingPeriod
  ) {}

  /**
   * Pull every metered bucket for the period and price each against `plans`
   * (meter → plan). Buckets whose meter has no plan are skipped (they may be
   * informational meters).
   */
  addUsage(plansByMeter: ReadonlyMap<string, Plan>): this {
    this._assertOpen();
    const aggregates = this._meter.aggregatesForPeriod(
      this._customerId,
      this._period
    );
    for (const agg of aggregates) {
      const plan = plansByMeter.get(agg.meter);
      if (!plan) continue;
      validatePlan(plan);
      const billable = billableQuantity(agg.quantity, plan);
      const amount = priceQuantity(billable, plan.pricing);
      this._lines.push({
        meter: agg.meter,
        description: describePlan(agg.meter, billable, plan),
        quantity: billable,
        amountCents: amount,
        dimensions: agg.dimensions,
      });
    }
    return this;
  }

  /**
   * Append a proration adjustment line (positive = charge, negative = credit).
   */
  addProration(pr: ProrationResult): this {
    this._assertOpen();
    if (pr.amountCents === 0) return this;
    this._lines.push({
      meter: 'proration',
      description: pr.description,
      quantity: 1,
      amountCents: pr.amountCents,
      isProration: true,
    });
    return this;
  }

  /**
   * Add a manual line (e.g. one-time setup fee).
   */
  addLine(line: InvoiceLine): this {
    this._assertOpen();
    this._lines.push(line);
    return this;
  }

  /**
   * Seal the invoice: apply available credits and compute amount due.
   * The result is immutable; the builder cannot be reused.
   */
  finalize(): Invoice {
    this._assertOpen();
    this._finalized = true;
    const total = this._lines.reduce((s, l) => s + l.amountCents, 0);
    const applied = this._ledger.apply(this._customerId, Math.max(0, total));
    const due = total - applied;
    return {
      invoiceId: this._invoiceId,
      customerId: this._customerId,
      period: this._period,
      lines: Object.freeze([...this._lines]),
      totalCents: total,
      creditsAppliedCents: applied,
      amountDueCents: due,
    };
  }

  private _assertOpen(): void {
    if (this._finalized) {
      throw new MeteringError('INVALID_PERIOD', 'invoice already finalized');
    }
  }
}

function describePlan(meter: string, quantity: number, plan: Plan): string {
  const model =
    plan.pricing.kind === 'flat'
      ? `flat @ ${plan.pricing.unitPriceCents}¢`
      : plan.pricing.kind;
  return `${meter}: ${quantity} units (${model})`;
}
