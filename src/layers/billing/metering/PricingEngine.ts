/**
 * Pricing Engine
 *
 * Pure functions that turn metered quantities into minor-unit charges.
 * Supports flat, tiered (volume), graduated (marginal), and package pricing,
 * plus banker's rounding for fractional quantities.
 *
 * All functions are total on validated plans — invalid plans are rejected by
 * {@link validatePlan} before pricing runs.
 *
 * @module BillingLayer/Metering
 */

import {
  CurrencyCode,
  CURRENCY_MINOR_UNITS,
  MeteringError,
  Plan,
  PriceTier,
  PricingModel,
} from './BillingTypes';

/**
 * Round-half-to-even (banker's rounding).
 *
 * Unlike `Math.round` (half-up), this distributes ties symmetrically which
 * prevents systematic bias when summing many rounded amounts. Operates on a
 * decimal string-free implementation: we scale the value, round the integer
 * part half-to-even, then rescale.
 *
 * @param value - the amount in major units to round
 * @param decimals - minor-unit decimals for the currency (0 for JPY, 3 for BHD)
 * @returns rounded major-unit amount
 */
export function bankersRound(value: number, decimals: number): number {
  const scale = Math.pow(10, decimals);
  const scaled = value * scale;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const EPSILON = 1e-9; // guard against fp error near .5

  let rounded: number;
  if (Math.abs(diff - 0.5) < EPSILON) {
    // Exact tie: round to the even neighbour.
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }
  return rounded / scale;
}

/**
 * Convert a major-unit decimal amount to integer minor units using banker's
 * rounding. This is the single funnel for all currency conversion.
 */
export function toMinorUnits(amount: number, currency: CurrencyCode): number {
  const decimals = CURRENCY_MINOR_UNITS[currency];
  return Math.round(bankersRound(amount, decimals) * Math.pow(10, decimals));
}

/**
 * Convert integer minor units back to a major-unit decimal (display only —
 * never feed back into arithmetic).
 */
export function fromMinorUnits(minor: number, currency: CurrencyCode): number {
  return minor / Math.pow(10, CURRENCY_MINOR_UNITS[currency]);
}

/**
 * Round a charge that was computed with fractional quantity × integer price.
 * Quantities like 3.7 GB-hours produce fractional cents; we banker's-round
 * to whole minor units.
 */
export function roundChargeCents(cents: number): number {
  return Math.round(bankersRound(cents, 0));
}

/**
 * Validate a tier schedule. Tiers must be contiguous (tier[i].to ===
 * tier[i+1].from), strictly increasing, start at 0, and only the last tier
 * may be unbounded.
 */
export function validateTiers(tiers: readonly PriceTier[]): void {
  if (tiers.length === 0) {
    throw new MeteringError('INVALID_PLAN', 'Pricing tiers must not be empty');
  }
  if (tiers[0].from !== 0) {
    throw new MeteringError('INVALID_PLAN', 'First tier must start at 0');
  }
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    const last = i === tiers.length - 1;
    if (!last && t.to === null) {
      throw new MeteringError(
        'INVALID_PLAN',
        `Tier ${i} is unbounded but not the last tier`
      );
    }
    if (t.to !== null && t.to <= t.from) {
      throw new MeteringError(
        'INVALID_PLAN',
        `Tier ${i} has to (${t.to}) <= from (${t.from})`
      );
    }
    if (!last && tiers[i + 1].from !== t.to) {
      throw new MeteringError(
        'INVALID_PLAN',
        `Tier ${i + 1} starts at ${tiers[i + 1].from}, expected ${t.to} (tiers must be contiguous)`
      );
    }
    if (t.unitPriceCents < 0) {
      throw new MeteringError('INVALID_PLAN', `Tier ${i} has negative price`);
    }
  }
}

/** Validate a whole plan object. */
export function validatePlan(plan: Plan): void {
  if (!plan.planId) throw new MeteringError('INVALID_PLAN', 'planId required');
  if (!plan.meter) throw new MeteringError('INVALID_PLAN', 'meter required');
  if (plan.freeQuantity !== undefined && plan.freeQuantity < 0) {
    throw new MeteringError('INVALID_PLAN', 'freeQuantity must be >= 0');
  }
  if (plan.pricing.kind === 'flat' && plan.pricing.unitPriceCents < 0) {
    throw new MeteringError('INVALID_PLAN', 'unit price must be >= 0');
  }
  if (plan.pricing.kind === 'package') {
    if (plan.pricing.unitsPerPackage <= 0) {
      throw new MeteringError('INVALID_PLAN', 'unitsPerPackage must be > 0');
    }
  }
  if (plan.pricing.kind === 'tiered' || plan.pricing.kind === 'graduated') {
    validateTiers(plan.pricing.tiers);
  }
}

/**
 * Price a flat model: quantity × unit price.
 */
function priceFlat(quantity: number, unitPriceCents: number): number {
  return roundChargeCents(quantity * unitPriceCents);
}

/**
 * Price a tiered (volume) model.
 *
 * Finds the single bracket containing `quantity` and applies that bracket's
 * unit price to the ENTIRE quantity (plus the bracket's flat fee if any).
 *
 * Complexity: O(t) linear scan over t tiers.
 */
function priceTiered(quantity: number, tiers: readonly PriceTier[]): number {
  for (const tier of tiers) {
    const inTier = tier.to === null ? quantity >= tier.from : quantity < tier.to;
    if (inTier && quantity >= tier.from) {
      return roundChargeCents(
        quantity * tier.unitPriceCents + (tier.flatFeeCents ?? 0)
      );
    }
  }
  // Unreachable for validated tiers (last is unbounded), but be total.
  return 0;
}

/**
 * Price a graduated (marginal) model.
 *
 * Each bracket contributes only the units inside it:
 *   total = Σ min(q, t.to) − t.from   for every bracket t
 * Plus each entered bracket's flat fee.
 *
 * Complexity: O(t).
 */
function priceGraduated(quantity: number, tiers: readonly PriceTier[]): number {
  let cents = 0;
  for (const tier of tiers) {
    if (quantity <= tier.from) break;
    const upper = tier.to === null ? quantity : Math.min(quantity, tier.to);
    const unitsInTier = upper - tier.from;
    if (unitsInTier <= 0) continue;
    cents += unitsInTier * tier.unitPriceCents + (tier.flatFeeCents ?? 0);
  }
  return roundChargeCents(cents);
}

/**
 * Price a package model: ceil(quantity / size) × package price.
 */
function pricePackage(
  quantity: number,
  unitsPerPackage: number,
  packagePriceCents: number
): number {
  const packages = Math.ceil(quantity / unitsPerPackage);
  return packages * packagePriceCents;
}

/**
 * Price `quantity` units under `pricing`. Quantity should already be the
 * BILLABLE amount (free allowance subtracted) — see {@link billableQuantity}.
 */
export function priceQuantity(quantity: number, pricing: PricingModel): number {
  if (quantity < 0) {
    throw new MeteringError('INVALID_PLAN', 'cannot price negative quantity');
  }
  if (quantity === 0) return 0;
  switch (pricing.kind) {
    case 'flat':
      return priceFlat(quantity, pricing.unitPriceCents);
    case 'tiered':
      return priceTiered(quantity, pricing.tiers);
    case 'graduated':
      return priceGraduated(quantity, pricing.tiers);
    case 'package':
      return pricePackage(
        quantity,
        pricing.unitsPerPackage,
        pricing.packagePriceCents
      );
  }
}

/**
 * Subtract a plan's free allowance from the raw aggregated quantity.
 */
export function billableQuantity(rawQuantity: number, plan: Plan): number {
  const free = plan.freeQuantity ?? 0;
  return Math.max(0, rawQuantity - free);
}

/**
 * Convenience: aggregate → billable → price for a single plan+quantity pair.
 */
export function pricePlan(rawQuantity: number, plan: Plan): number {
  validatePlan(plan);
  return priceQuantity(billableQuantity(rawQuantity, plan), plan.pricing);
}
