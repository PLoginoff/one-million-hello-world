/**
 * Proration Engine
 *
 * Computes time-weighted credits/charges when a subscription changes mid-cycle
 * (seat count, plan tier, quantity).
 *
 * Model: the period is pre-paid at `oldUnitPrice × oldQuantity` for the whole
 * period. A mid-cycle change means the customer:
 *   - is credited for the UNUSED fraction of the old charge: oldDaily × remainingDays
 *   - is charged for the REMAINING fraction at the new rate: newDaily × remainingDays
 *
 * We use day-granularity (floor the timestamp to UTC midnight) so results are
 * stable and match how invoices are typically presented ("12 days remaining").
 * Fractional cents are banker's-rounded at the end.
 *
 * @module BillingLayer/Metering
 */

import { BillingPeriod, ProrationRequest, ProrationResult } from './BillingTypes';
import { roundChargeCents } from './PricingEngine';
import { BillingCalendar } from './BillingCalendar';

const MS_PER_DAY = 86_400_000;

export class ProrationEngine {
  private readonly _calendar = new BillingCalendar();

  /**
   * Compute the net adjustment for a mid-cycle quantity/price change.
   *
   * Positive amount → the customer owes more (upgrade or seat add).
   * Negative amount → credit owed back (downgrade or seat removal).
   *
   * @param period - the billing period the change falls inside
   * @param req    - the change parameters
   */
  prorate(period: BillingPeriod, req: ProrationRequest): ProrationResult {
    if (req.effectiveAt < period.start || req.effectiveAt >= period.end) {
      throw new Error(
        `effectiveAt ${req.effectiveAt} is outside period [${period.start}, ${period.end})`
      );
    }
    const totalDays = this._calendar.daysInPeriod(period);
    // Whole days remaining counting from the UTC day of the change.
    const dayOfChange = Math.floor(req.effectiveAt / MS_PER_DAY) * MS_PER_DAY;
    const endDay = Math.floor(period.end / MS_PER_DAY) * MS_PER_DAY;
    const remainingDays = Math.max(
      0,
      Math.round((endDay - dayOfChange) / MS_PER_DAY)
    );

    const oldDaily = (req.oldUnitPriceCents * req.oldQuantity) / totalDays;
    const newDaily = (req.newUnitPriceCents * req.newQuantity) / totalDays;

    // Net = what they'd pay on new plan for rest of period − credit for old.
    const amountCents = roundChargeCents(
      (newDaily - oldDaily) * remainingDays
    );

    const direction = amountCents >= 0 ? 'charge' : 'credit';
    const description =
      `Proration ${direction}: ${req.oldQuantity}→${req.newQuantity} units ` +
      `@ ${req.oldUnitPriceCents}→${req.newUnitPriceCents}¢, ` +
      `${remainingDays}/${totalDays} days remaining`;

    return { amountCents, description, remainingDays, totalDays };
  }

  /**
   * Convenience: prorate a seat-count change with a fixed unit price.
   */
  prorateSeats(
    period: BillingPeriod,
    effectiveAt: number,
    unitPriceCents: number,
    oldSeats: number,
    newSeats: number
  ): ProrationResult {
    return this.prorate(period, {
      effectiveAt,
      oldUnitPriceCents: unitPriceCents,
      newUnitPriceCents: unitPriceCents,
      oldQuantity: oldSeats,
      newQuantity: newSeats,
    });
  }
}
