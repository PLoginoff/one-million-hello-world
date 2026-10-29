/**
 * Billing Metering Types
 *
 * Core value types for the usage-metering engine: usage events, billing
 * periods, pricing plans, invoice line items, dunning state, and currency
 * handling. All monetary amounts are stored as integer minor units (cents)
 * to avoid IEEE-754 rounding drift.
 *
 * @module BillingLayer/Metering
 */

/** ISO-4217 currency codes supported by the rounding engine. */
export type CurrencyCode = 'USD' | 'EUR' | 'JPY' | 'BHD' | 'GBP' | 'CHF';

/** Number of minor units per major unit for each supported currency. */
export const CURRENCY_MINOR_UNITS: Readonly<Record<CurrencyCode, number>> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CHF: 2,
  JPY: 0, // yen has no minor unit
  BHD: 3, // Bahraini dinar has 3 decimals
};

/**
 * A metered usage event submitted by a service.
 *
 * `idempotencyKey` guarantees at-least-once producers can retry safely —
 * the metering engine deduplicates on (customerId, idempotencyKey).
 */
export interface UsageEvent {
  /** Customer (or subscription) that consumed the resource. */
  readonly customerId: string;
  /** Meter name, e.g. "api-calls", "gb-stored", "seat-count". */
  readonly meter: string;
  /** Quantity consumed. May be fractional for meters like GB-hours. */
  readonly quantity: number;
  /** When the consumption occurred (epoch ms). */
  readonly occurredAt: number;
  /** Producer-supplied dedup key. */
  readonly idempotencyKey: string;
  /** Optional grouping dimensions, e.g. { region: 'us-east' }. */
  readonly dimensions?: Readonly<Record<string, string>>;
}

/** Billing period kinds. */
export type PeriodKind =
  | { readonly kind: 'calendar' }
  /** Anniversary cycle anchored to the subscription start day-of-month. */
  | { readonly kind: 'anniversary'; readonly anchorDay: number };

/** A closed billing interval [start, end). */
export interface BillingPeriod {
  readonly start: number;
  readonly end: number;
  readonly kind: PeriodKind;
}

/** Pricing models attached to a metered plan. */
export type PricingModel =
  | { readonly kind: 'flat'; readonly unitPriceCents: number }
  /**
   * Tiered (a.k.a. "volume"): the price of the highest tier reached applies
   * to ALL units, e.g. 100 units in a 0-49:$2 / 50+:$1 plan costs $100.
   */
  | { readonly kind: 'tiered'; readonly tiers: readonly PriceTier[] }
  /**
   * Graduated: units are priced per-tier bracket, e.g. first 50 @ $2,
   * remainder @ $1 — the classic marginal pricing model.
   */
  | { readonly kind: 'graduated'; readonly tiers: readonly PriceTier[] }
  /**
   * Package: quantity is billed in fixed-size bundles, rounding up.
   * e.g. unitsPerPackage=10, $5/package → 21 units = 3 packages = $15.
   */
  | {
      readonly kind: 'package';
      readonly unitsPerPackage: number;
      readonly packagePriceCents: number;
    };

/** One bracket of a tiered/graduated schedule. */
export interface PriceTier {
  /** Inclusive lower bound of the bracket. */
  readonly from: number;
  /**
   * Exclusive upper bound; `null` = unbounded (must be last tier).
   * For graduated pricing this is the bracket width boundary.
   */
  readonly to: number | null;
  /** Minor-unit price per unit inside this bracket. */
  readonly unitPriceCents: number;
  /** Optional flat fee added once when the tier is entered. */
  readonly flatFeeCents?: number;
}

/** A billable plan binds a meter to a pricing model and a period. */
export interface Plan {
  readonly planId: string;
  readonly meter: string;
  readonly pricing: PricingModel;
  readonly periodKind: PeriodKind;
  /** Optional free allowance burned down before charging. */
  readonly freeQuantity?: number;
}

/** A single aggregated line on an invoice. */
export interface InvoiceLine {
  readonly meter: string;
  readonly description: string;
  /** Aggregated, billable quantity (after free allowance). */
  readonly quantity: number;
  /** Total charge for this line in minor units. */
  readonly amountCents: number;
  /** Per-dimension breakdown used for invoice grouping. */
  readonly dimensions?: Readonly<Record<string, string>>;
  /** True for proration credit/debit adjustment lines. */
  readonly isProration?: boolean;
}

/** Status of a dunning (failed-payment recovery) record. */
export type DunningState =
  | 'none'
  | 'pending-retry'
  | 'retrying'
  | 'exhausted'
  | 'recovered'
  | 'written-off';

/** A proration request: plan quantity/price changed mid-cycle. */
export interface ProrationRequest {
  /** Timestamp the change takes effect (epoch ms). */
  readonly effectiveAt: number;
  /** Old per-unit price (minor units). */
  readonly oldUnitPriceCents: number;
  /** New per-unit price (minor units). */
  readonly newUnitPriceCents: number;
  /** Quantity before the change (e.g. seat count). */
  readonly oldQuantity: number;
  /** Quantity after the change. */
  readonly newQuantity: number;
}

/** Result of applying proration inside a period. */
export interface ProrationResult {
  /** Credit owed back to the customer (negative = extra charge). */
  readonly amountCents: number;
  /** Human-readable explanation for the invoice line. */
  readonly description: string;
  /** Number of whole days remaining in the period at `effectiveAt`. */
  readonly remainingDays: number;
  readonly totalDays: number;
}

/** Customer credit ledger entry. */
export interface CreditEntry {
  readonly creditId: string;
  readonly customerId: string;
  /** Positive = credit available; can go negative for balance-due tracking. */
  readonly amountCents: number;
  readonly issuedAt: number;
  readonly reason: string;
}

/** Invoice produced for one customer + period. */
export interface Invoice {
  readonly invoiceId: string;
  readonly customerId: string;
  readonly period: BillingPeriod;
  readonly lines: readonly InvoiceLine[];
  /** Sum of line amounts, minor units. */
  readonly totalCents: number;
  /** Credits applied at invoice time. */
  readonly creditsAppliedCents: number;
  /** `totalCents - creditsAppliedCents`, may be negative (credit balance). */
  readonly amountDueCents: number;
}

/** Injectable clock — all time-sensitive logic goes through this. */
export interface Clock {
  now(): number;
}

/** Simple wall-clock implementation for production wiring. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** Errors raised by the metering engine. */
export class MeteringError extends Error {
  constructor(
    public readonly code:
      | 'DUPLICATE_EVENT'
      | 'INVALID_EVENT'
      | 'INVALID_PLAN'
      | 'INVALID_PERIOD'
      | 'NO_PLAN'
      | 'DUPLICATE_CREDIT',
    message: string
  ) {
    super(message);
    this.name = 'MeteringError';
  }
}
