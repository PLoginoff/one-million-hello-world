/**
 * Tax Jurisdiction Engine
 *
 * Determines the tax treatment for an invoice line given the buyer's
 * jurisdiction, the seller's nexus registrations, and exemption
 * certificates — the real-world complexity the flat `taxBps` line-item
 * field abstracts away.
 *
 * Model:
 *  - Nexus: seller must be registered in a jurisdiction to charge its
 *    tax there (US marketplace rules aside, that's the common case).
 *  - Jurisdictions compose: state + county + city rates stack
 *    ("compound" jurisdictions where a later level taxes the
 *    tax-inclusive amount are supported via `compound: true`).
 *  - Exemption certificates zero the tax for matching product kinds
 *    until `validUntilMs` lapses.
 *
 * All math in minor units; compound rates multiply basis points.
 *
 * @module BillingLayer/Engine2
 */

import type { Money } from './CreditNotes';

/** A tax level inside a jurisdiction (state/county/city/…). */
export interface TaxLevel {
  readonly name: string;
  /** Rate in basis points (825 = 8.25%). */
  readonly rateBps: number;
  /** When true, this level taxes the amount INCLUDING lower-level tax. */
  readonly compound?: boolean;
}

export interface Jurisdiction {
  /** e.g. `US-CA`, `EU-DE`, `CA-ON`. */
  readonly code: string;
  readonly levels: readonly TaxLevel[];
}

/** A buyer's exemption certificate. */
export interface ExemptionCertificate {
  readonly id: string;
  readonly jurisdictionCode: string;
  /** Product kinds exempted; `['*']` = everything. */
  readonly productKinds: readonly string[];
  readonly validUntilMs?: number;
}

export interface TaxContext {
  /** Buyer's jurisdiction code (ship-to / billing address). */
  readonly buyerJurisdiction: string;
  /** Product kind for exemption matching, e.g. `saas`, `hardware`. */
  readonly productKind: string;
  /** Certificates the buyer has on file. */
  readonly certificates?: readonly ExemptionCertificate[];
}

export interface TaxBreakdownLine {
  readonly level: string;
  readonly rateBps: number;
  readonly amount: Money;
  readonly compounded: boolean;
}

export interface TaxResult {
  readonly jurisdictionCode: string;
  /** 0 when no nexus or fully exempt. */
  readonly totalTax: Money;
  readonly lines: readonly TaxBreakdownLine[];
  /** Why tax is zero, when it is. */
  readonly reason?: 'no-nexus' | 'exempt' | 'unknown-jurisdiction';
  readonly exemptedBy?: string;
}

export class TaxEngine {
  private readonly _jurisdictions = new Map<string, Jurisdiction>();
  /** Jurisdiction codes the seller is registered in. */
  private readonly _nexus = new Set<string>();
  private readonly _clock: { now(): number };

  constructor(clock?: { now(): number }) {
    this._clock = clock ?? { now: () => Date.now() };
  }

  registerJurisdiction(j: Jurisdiction): void {
    this._jurisdictions.set(j.code, j);
  }

  registerNexus(jurisdictionCode: string): void {
    this._nexus.add(jurisdictionCode);
  }

  unregisterNexus(jurisdictionCode: string): void {
    this._nexus.delete(jurisdictionCode);
  }

  /**
   * Compute tax on `amount` (minor units) for `ctx`. Returns zero with a
   * reason when no tax applies — never silently zero.
   */
  compute(amount: Money, ctx: TaxContext): TaxResult {
    const jur = this._jurisdictions.get(ctx.buyerJurisdiction);
    if (!jur) {
      return {
        jurisdictionCode: ctx.buyerJurisdiction,
        totalTax: 0,
        lines: [],
        reason: 'unknown-jurisdiction',
      };
    }
    if (!this._nexus.has(ctx.buyerJurisdiction)) {
      return {
        jurisdictionCode: ctx.buyerJurisdiction,
        totalTax: 0,
        lines: [],
        reason: 'no-nexus',
      };
    }

    // Valid exemption matching the product kind zeroes the whole thing.
    const now = this._clock.now();
    const exempt = (ctx.certificates ?? []).find(
      (c) =>
        c.jurisdictionCode === ctx.buyerJurisdiction &&
        (c.validUntilMs === undefined || c.validUntilMs > now) &&
        (c.productKinds.includes('*') || c.productKinds.includes(ctx.productKind))
    );
    if (exempt) {
      return {
        jurisdictionCode: ctx.buyerJurisdiction,
        totalTax: 0,
        lines: [],
        reason: 'exempt',
        exemptedBy: exempt.id,
      };
    }

    // Walk levels in order; compound levels see the running total.
    const lines: TaxBreakdownLine[] = [];
    let running = amount;
    let total = 0;
    for (const lvl of jur.levels) {
      const base = lvl.compound ? running : amount;
      const t = Math.round((base * lvl.rateBps) / 10_000);
      lines.push({
        level: lvl.name,
        rateBps: lvl.rateBps,
        amount: t,
        compounded: lvl.compound === true,
      });
      total += t;
      running = amount + total;
    }
    return { jurisdictionCode: ctx.buyerJurisdiction, totalTax: total, lines };
  }

  /** Effective combined rate for a jurisdiction — for price displays. */
  effectiveRateBps(code: string): number {
    const jur = this._jurisdictions.get(code);
    if (!jur) return 0;
    // Compound levels multiply; simple levels add.
    let simple = 0;
    let compounded = 10_000; // 1.0 in bps
    for (const l of jur.levels) {
      if (l.compound) {
        compounded = Math.round((compounded * (10_000 + l.rateBps)) / 10_000);
      } else {
        simple += l.rateBps;
      }
    }
    return Math.round((10_000 + simple) * (compounded / 10_000)) - 10_000;
  }
}
