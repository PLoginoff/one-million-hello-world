/**
 * Receivables Aging Report
 *
 * Buckets unpaid invoices into the classic 0/30/60/90+ day aging bands
 * for collections dashboards and bad-debt provisioning. Computes
 * days-outstanding from `dueDateMs` (not issue date — aging is against
 * terms), and supports per-customer rollups.
 *
 * The report is a snapshot against the injected clock — deterministic.
 *
 * @module BillingLayer/Engine2
 */

import type { Money } from './CreditNotes';

export interface OpenInvoice {
  readonly invoiceId: string;
  readonly customerId: string;
  readonly amountDue: Money;
  readonly dueDateMs: number;
}

export type AgingBand = 'current' | '1-30' | '31-60' | '61-90' | '90+';

export interface BandTotal {
  readonly band: AgingBand;
  readonly count: number;
  readonly amount: Money;
  readonly invoiceIds: readonly string[];
}

export interface CustomerAging {
  readonly customerId: string;
  readonly total: Money;
  readonly oldestDueMs?: number;
  readonly bands: readonly BandTotal[];
}

export interface AgingReport {
  readonly asOfMs: number;
  readonly totalOutstanding: Money;
  readonly invoiceCount: number;
  readonly bands: readonly BandTotal[];
  readonly byCustomer: readonly CustomerAging[];
  /** Weighted average days past due (0 for current invoices). */
  readonly weightedDaysPastDue: number;
}

const DAY = 86_400_000;
const BAND_ORDER: readonly AgingBand[] = ['current', '1-30', '31-60', '61-90', '90+'];

function bandFor(daysPastDue: number): AgingBand {
  if (daysPastDue <= 0) return 'current';
  if (daysPastDue <= 30) return '1-30';
  if (daysPastDue <= 60) return '31-60';
  if (daysPastDue <= 90) return '61-90';
  return '90+';
}

export class AgingReportGenerator {
  private readonly _clock: { now(): number };

  constructor(clock?: { now(): number }) {
    this._clock = clock ?? { now: () => Date.now() };
  }

  /** Bucket `invoices` into aging bands as of now. */
  generate(invoices: readonly OpenInvoice[]): AgingReport {
    const now = this._clock.now();
    const perBand = new Map<AgingBand, { count: number; amount: Money; ids: string[] }>(
      BAND_ORDER.map((b) => [b, { count: 0, amount: 0, ids: [] }])
    );
    const perCustomer = new Map<
      string,
      { total: Money; oldestDueMs?: number; perBand: Map<AgingBand, { count: number; amount: Money; ids: string[] }> }
    >();

    let total = 0;
    let weightedSum = 0;

    for (const inv of invoices) {
      const daysPastDue = Math.floor((now - inv.dueDateMs) / DAY);
      const band = bandFor(daysPastDue);
      const b = perBand.get(band)!;
      b.count++;
      b.amount += inv.amountDue;
      b.ids.push(inv.invoiceId);
      total += inv.amountDue;
      weightedSum += Math.max(0, daysPastDue) * inv.amountDue;

      let c = perCustomer.get(inv.customerId);
      if (!c) {
        c = {
          total: 0,
          perBand: new Map(BAND_ORDER.map((x) => [x, { count: 0, amount: 0, ids: [] }])),
        };
        perCustomer.set(inv.customerId, c);
      }
      c.total += inv.amountDue;
      if (c.oldestDueMs === undefined || inv.dueDateMs < c.oldestDueMs) {
        c.oldestDueMs = inv.dueDateMs;
      }
      const cb = c.perBand.get(band)!;
      cb.count++;
      cb.amount += inv.amountDue;
      cb.ids.push(inv.invoiceId);
    }

    const bands: BandTotal[] = BAND_ORDER.map((band) => {
      const b = perBand.get(band)!;
      return { band, count: b.count, amount: b.amount, invoiceIds: b.ids };
    });

    const byCustomer: CustomerAging[] = [...perCustomer.entries()].map(([customerId, c]) => ({
      customerId,
      total: c.total,
      oldestDueMs: c.oldestDueMs,
      bands: BAND_ORDER.map((band) => {
        const cb = c.perBand.get(band)!;
        return { band, count: cb.count, amount: cb.amount, invoiceIds: cb.ids };
      }).filter((x) => x.count > 0),
    }));

    return {
      asOfMs: now,
      totalOutstanding: total,
      invoiceCount: invoices.length,
      bands,
      byCustomer,
      weightedDaysPastDue: total > 0 ? Math.round(weightedSum / total) : 0,
    };
  }
}
