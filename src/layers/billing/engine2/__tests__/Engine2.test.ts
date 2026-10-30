/**
 * Tests for billing engine2: invoice layout, credit notes/refunds,
 * subscription lifecycle, usage aggregation with tiered overage.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { layOutInvoice, computeTotals, renderText, InvoiceModel } from '../InvoiceDocument';
import { CreditLedger2, CreditNoteError } from '../CreditNotes';
import { SubscriptionLifecycle, LifecycleError } from '../SubscriptionLifecycle';
import { UsageAggregator, MeterRate } from '../UsageAggregator';
import { TaxEngine, Jurisdiction } from '../TaxEngine';
import { AgingReportGenerator } from '../AgingReport';

class FakeClock {
  t = 0;
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

const INVOICE: InvoiceModel = {
  number: 'INV-0001',
  issueDateMs: Date.UTC(2026, 0, 15),
  dueDateMs: Date.UTC(2026, 1, 14),
  currency: 'USD',
  seller: { name: 'Acme Corp', lines: ['1 Main St'], taxId: 'US-123' },
  buyer: { name: 'Globex', lines: ['456 Elm'] },
  items: [
    { description: 'API calls (millions)', quantity: 4, unitPrice: 5000, taxBps: 2000 },
    { description: 'Support plan', quantity: 1, unitPrice: 10000, discount: 1000, taxBps: 2000 },
  ],
  discount: 500,
  notes: ['Net-30 terms', 'Thanks!'],
};

describe('InvoiceDocument', () => {
  it('computes totals with discounts and tax', () => {
    const t = computeTotals(INVOICE);
    // 4×5000 = 20000; 1×10000−1000 = 9000; subtotal 30000, line disc 1000
    expect(t.subtotal).toBe(30000);
    expect(t.lineDiscounts).toBe(1000);
    // tax: (20000×20%) + (9000×20%) = 4000 + 1800 = 5800
    expect(t.tax).toBe(5800);
    expect(t.invoiceDiscount).toBe(500);
    expect(t.taxable).toBe(30000 - 1000 - 500);
    expect(t.total).toBe(28500 + 5800);
  });

  it('lays out positioned text runs grouped by section', () => {
    const doc = layOutInvoice(INVOICE);
    expect(doc.width).toBe(612);
    const names = doc.sections.map((s) => s.name);
    expect(names).toEqual(['header', 'parties', 'items', 'totals', 'footer']);
    const items = doc.sections.find((s) => s.name === 'items')!;
    // header row + 2 item rows of runs
    expect(items.runs.length).toBeGreaterThanOrEqual(6 * 3);
    const totals = doc.sections.find((s) => s.name === 'totals')!;
    const totalTexts = totals.runs.map((r) => r.text).join(' ');
    expect(totalTexts).toContain('USD 343.00');
  });

  it('renders structured text', () => {
    const text = renderText(layOutInvoice(INVOICE));
    expect(text).toContain('=== HEADER ===');
    expect(text).toContain('INV-0001');
    expect(text).toContain('Globex');
    expect(text).toContain('API calls (millions)');
  });

  it('handles zero-tax invoices', () => {
    const plain: InvoiceModel = {
      ...INVOICE,
      items: [{ description: 'x', quantity: 1, unitPrice: 1000 }],
      discount: undefined,
      notes: undefined,
    };
    const doc = layOutInvoice(plain);
    expect(doc.totals.tax).toBe(0);
    expect(doc.totals.total).toBe(1000);
  });
});

describe('CreditLedger2', () => {
  let clock: FakeClock;
  let ledger: CreditLedger2;

  beforeEach(() => {
    clock = new FakeClock();
    ledger = new CreditLedger2(clock);
    ledger.registerInvoice('inv-1', 10000);
  });

  it('issues partial credit notes up to the balance', () => {
    const n1 = ledger.issueCreditNote('inv-1', 3000, 'goodwill');
    expect(n1.amount).toBe(3000);
    expect(ledger.creditableBalance('inv-1')).toBe(7000);
    const n2 = ledger.issueCreditNote('inv-1', 7000, 'return');
    expect(ledger.creditableBalance('inv-1')).toBe(0);
    expect(ledger.amountDue('inv-1')).toBe(0);
    expect(ledger.adjustments('inv-1').length).toBe(2);
  });

  it('rejects credits exceeding remaining balance', () => {
    ledger.issueCreditNote('inv-1', 6000, 'r');
    expect(() => ledger.issueCreditNote('inv-1', 5000, 'too much')).toThrow(CreditNoteError);
  });

  it('issues partial refunds', () => {
    const r1 = ledger.issueRefund('inv-1', 4000, 'original');
    expect(r1.status).toBe('completed');
    expect(ledger.refundableBalance('inv-1')).toBe(6000);
    const r2 = ledger.issueRefund('inv-1', 6000, 'balance', r1.id);
    expect(r2.creditNoteId).toBe(r1.id);
    expect(ledger.refundableBalance('inv-1')).toBe(0);
    expect(() => ledger.issueRefund('inv-1', 1, 'original')).toThrow(CreditNoteError);
  });

  it('rejects duplicate invoice registration', () => {
    expect(() => ledger.registerInvoice('inv-1', 1)).toThrow(CreditNoteError);
  });

  it('tracks adjustments per invoice', () => {
    ledger.registerInvoice('inv-2', 500);
    ledger.issueCreditNote('inv-1', 1000, 'a');
    ledger.issueRefund('inv-2', 500, 'manual');
    expect(ledger.adjustments('inv-1').length).toBe(1);
    expect(ledger.adjustments('inv-2').length).toBe(1);
  });
});

describe('SubscriptionLifecycle', () => {
  let clock: FakeClock;
  let lc: SubscriptionLifecycle;

  beforeEach(() => {
    clock = new FakeClock(1_000_000);
    lc = new SubscriptionLifecycle(clock, {
      trialMs: 14 * 24 * 3600_000,
      pastDueGraceMs: 7 * 24 * 3600_000,
      retryOffsetsMs: [1000, 2000, 4000],
    });
  });

  it('starts trialing and auto-cancels on trial expiry', () => {
    const s = lc.create('c1', 'pro');
    expect(s.state).toBe('trialing');
    expect(s.trialEndsAt).toBe(clock.t + 14 * 24 * 3600_000);
    clock.advance(14 * 24 * 3600_000 + 1);
    const evs = lc.tick();
    expect(lc.get(s.id).state).toBe('canceled');
    expect(evs[0].type).toBe('canceled');
  });

  it('activates trial on payment method', () => {
    const s = lc.create('c1', 'pro');
    lc.activate(s.id);
    expect(lc.get(s.id).state).toBe('active');
    clock.advance(20 * 24 * 3600_000);
    lc.tick();
    expect(lc.get(s.id).state).toBe('active'); // not auto-canceled
  });

  it('walks past_due with dunning and recovers', () => {
    const s = lc.create('c1', 'pro');
    lc.activate(s.id);
    lc.failPayment(s.id);
    expect(lc.get(s.id).state).toBe('past_due');
    lc.failPayment(s.id);
    const s2 = lc.get(s.id);
    expect(s2.dunningAttempts).toBe(2);
    const failEv = s2.events.filter((e) => e.type === 'payment_failed').pop();
    expect(failEv?.type).toBe('payment_failed');
    lc.recordPayment(s.id);
    expect(lc.get(s.id).state).toBe('active');
    expect(lc.get(s.id).dunningAttempts).toBe(0);
  });

  it('auto-cancels when past_due grace expires', () => {
    const s = lc.create('c1', 'pro');
    lc.activate(s.id);
    lc.failPayment(s.id);
    clock.advance(7 * 24 * 3600_000 + 1);
    const evs = lc.tick();
    expect(lc.get(s.id).state).toBe('canceled');
    expect(evs.some((e) => e.type === 'canceled' && e.reason === 'grace_expired')).toBe(true);
  });

  it('voluntary cancel works from any active state', () => {
    const s = lc.create('c1', 'pro');
    lc.cancel(s.id);
    expect(lc.get(s.id).cancelReason).toBe('voluntary');
    expect(() => lc.cancel(s.id)).toThrow(LifecycleError);
  });

  it('rejects invalid transitions', () => {
    const s = lc.create('c1', 'pro');
    expect(() => lc.failPayment(s.id)).toThrow(LifecycleError); // trialing → failPayment invalid
  });

  it('lists subscriptions by state', () => {
    const a = lc.create('a', 'p');
    const b = lc.create('b', 'p');
    lc.activate(a.id);
    lc.failPayment(a.id);
    expect(lc.inState('past_due').length).toBe(1);
    expect(lc.inState('trialing').length).toBe(1);
    void b;
  });
});

describe('UsageAggregator', () => {
  const agg = new UsageAggregator();
  const meter: MeterRate = {
    meter: 'api-calls',
    includedUnits: 1000,
    tiers: [
      { from: 0, to: 5000, unitPrice: 10 }, // 1000..6000 over at 10¢
      { from: 5000, to: 20000, unitPrice: 5 },
      { from: 20000, unitPrice: 1 },
    ],
  };

  it('aggregates sums within the period only', () => {
    const events = [
      { customerId: 'c', meter: 'api-calls', quantity: 500, timestampMs: 100 },
      { customerId: 'c', meter: 'api-calls', quantity: 700, timestampMs: 200 },
      { customerId: 'c', meter: 'api-calls', quantity: 999, timestampMs: 5000 }, // outside
      { customerId: 'other', meter: 'api-calls', quantity: 9999, timestampMs: 150 }, // other cust
    ];
    const r = agg.aggregate('c', meter, events, 0, 1000);
    expect(r.rawQuantity).toBe(1200);
  });

  it('prices overage across tiers', () => {
    // 25000 raw - 1000 included = 24000 billable.
    const r = agg.price('c', meter, 25000, 0, 1000);
    expect(r.billableQuantity).toBe(24000);
    // 5000@10 + 15000@5 + 4000@1 = 50000+75000+4000 = 129000
    expect(r.amount).toBe(129000);
    expect(r.breakdown.length).toBe(3);
    expect(r.breakdown[2].units).toBe(4000);
  });

  it('zero billable under the included allowance', () => {
    const r = agg.price('c', meter, 500, 0, 1000);
    expect(r.billableQuantity).toBe(0);
    expect(r.amount).toBe(0);
    expect(r.breakdown.length).toBe(0);
  });

  it('hard cap suppresses billing over the cap', () => {
    const capped: MeterRate = { ...meter, hardCap: 2000 };
    const r = agg.price('c', capped, 100_000, 0, 1000);
    expect(r.billableQuantity).toBe(2000);
    expect(r.cappedQuantity).toBe(100_000 - 1000 - 2000);
    expect(r.amount).toBe(2000 * 10);
  });

  it('max and last semantics', () => {
    const maxMeter: MeterRate = { meter: 'seats', includedUnits: 0, tiers: [{ from: 0, unitPrice: 1 }], kind: 'max' };
    const lastMeter: MeterRate = { ...maxMeter, kind: 'last' };
    const events = [
      { customerId: 'c', meter: 'seats', quantity: 5, timestampMs: 100 },
      { customerId: 'c', meter: 'seats', quantity: 9, timestampMs: 200 },
      { customerId: 'c', meter: 'seats', quantity: 3, timestampMs: 300 },
    ];
    expect(agg.aggregate('c', maxMeter, events, 0, 1000).rawQuantity).toBe(9);
    expect(agg.aggregate('c', lastMeter, events, 0, 1000).rawQuantity).toBe(3);
  });

  it('validates tier schedules', () => {
    expect(() => UsageAggregator.validateTiers(meter.tiers)).not.toThrow();
    expect(() =>
      UsageAggregator.validateTiers([{ from: 1, to: 5, unitPrice: 1 }])
    ).toThrow();
    expect(() =>
      UsageAggregator.validateTiers([
        { from: 0, to: 5, unitPrice: 1 },
        { from: 6, to: 9, unitPrice: 1 },
      ])
    ).toThrow();
  });
});

describe('TaxEngine', () => {
  let clock: FakeClock;
  let tax: TaxEngine;

  const CA: Jurisdiction = {
    code: 'US-CA',
    levels: [
      { name: 'state', rateBps: 600 },
      { name: 'county', rateBps: 125 },
      { name: 'city', rateBps: 100 },
    ],
  };
  const QC: Jurisdiction = {
    code: 'CA-QC',
    levels: [
      { name: 'GST', rateBps: 500 },
      { name: 'QST', rateBps: 997, compound: true }, // taxes GST-inclusive
    ],
  };

  beforeEach(() => {
    clock = new FakeClock(1_000_000);
    tax = new TaxEngine(clock);
    tax.registerJurisdiction(CA);
    tax.registerJurisdiction(QC);
    tax.registerNexus('US-CA');
    tax.registerNexus('CA-QC');
  });

  it('stacks non-compound levels on the base', () => {
    const r = tax.compute(10000, { buyerJurisdiction: 'US-CA', productKind: 'saas' });
    // 6% + 1.25% + 1% = 8.25% → 825
    expect(r.totalTax).toBe(825);
    expect(r.lines.length).toBe(3);
    expect(r.lines.every((l) => !l.compounded)).toBe(true);
  });

  it('compound levels tax the tax-inclusive amount', () => {
    const r = tax.compute(10000, { buyerJurisdiction: 'CA-QC', productKind: 'saas' });
    // GST 5% = 500 → running 10500; QST 9.97% × 10500 = 1046.85 → 1047
    expect(r.lines[0].amount).toBe(500);
    expect(r.lines[1].compounded).toBe(true);
    expect(r.lines[1].amount).toBe(1047);
    expect(r.totalTax).toBe(1547);
  });

  it('no nexus → zero tax with reason', () => {
    tax.unregisterNexus('US-CA');
    const r = tax.compute(10000, { buyerJurisdiction: 'US-CA', productKind: 'saas' });
    expect(r.totalTax).toBe(0);
    expect(r.reason).toBe('no-nexus');
  });

  it('unknown jurisdiction → zero tax with reason', () => {
    const r = tax.compute(10000, { buyerJurisdiction: 'US-WY', productKind: 'saas' });
    expect(r.reason).toBe('unknown-jurisdiction');
  });

  it('exemption certificates zero matching product kinds', () => {
    const r = tax.compute(10000, {
      buyerJurisdiction: 'US-CA',
      productKind: 'saas',
      certificates: [
        { id: 'ex-1', jurisdictionCode: 'US-CA', productKinds: ['saas'] },
      ],
    });
    expect(r.totalTax).toBe(0);
    expect(r.reason).toBe('exempt');
    expect(r.exemptedBy).toBe('ex-1');
  });

  it('expired certificates do not exempt', () => {
    const r = tax.compute(10000, {
      buyerJurisdiction: 'US-CA',
      productKind: 'saas',
      certificates: [
        {
          id: 'ex-old',
          jurisdictionCode: 'US-CA',
          productKinds: ['saas'],
          validUntilMs: clock.now() - 1,
        },
      ],
    });
    expect(r.totalTax).toBe(825);
  });

  it('wildcard certificates exempt everything', () => {
    const r = tax.compute(10000, {
      buyerJurisdiction: 'US-CA',
      productKind: 'hardware',
      certificates: [{ id: 'ex-all', jurisdictionCode: 'US-CA', productKinds: ['*'] }],
    });
    expect(r.totalTax).toBe(0);
  });

  it('effectiveRateBps composes simple + compound levels', () => {
    // CA: 6+1.25+1 = 8.25% simple
    expect(tax.effectiveRateBps('US-CA')).toBe(825);
    // QC: 5% simple then 9.97% compound → (1.05)(1.0997)−1 = 15.4685%
    expect(tax.effectiveRateBps('CA-QC')).toBe(1547); // rounds to 1547 bps? let’s see
  });
});

describe('AgingReportGenerator', () => {
  let clock: FakeClock;
  let gen: AgingReportGenerator;
  const DAY = 86_400_000;

  beforeEach(() => {
    clock = new FakeClock(100 * DAY);
    gen = new AgingReportGenerator(clock);
  });

  it('buckets invoices into aging bands by days past due', () => {
    const report = gen.generate([
      { invoiceId: 'i1', customerId: 'c1', amountDue: 1000, dueDateMs: clock.now() + 10 * DAY }, // future = current
      { invoiceId: 'i2', customerId: 'c1', amountDue: 2000, dueDateMs: clock.now() - 15 * DAY }, // 1-30
      { invoiceId: 'i3', customerId: 'c2', amountDue: 3000, dueDateMs: clock.now() - 45 * DAY }, // 31-60
      { invoiceId: 'i4', customerId: 'c2', amountDue: 4000, dueDateMs: clock.now() - 75 * DAY }, // 61-90
      { invoiceId: 'i5', customerId: 'c3', amountDue: 5000, dueDateMs: clock.now() - 200 * DAY }, // 90+
    ]);
    expect(report.invoiceCount).toBe(5);
    expect(report.totalOutstanding).toBe(15000);
    const byBand = new Map(report.bands.map((b) => [b.band, b]));
    expect(byBand.get('current')!.amount).toBe(1000);
    expect(byBand.get('1-30')!.amount).toBe(2000);
    expect(byBand.get('31-60')!.amount).toBe(3000);
    expect(byBand.get('61-90')!.amount).toBe(4000);
    expect(byBand.get('90+')!.amount).toBe(5000);
    // Weighted DPD: (0×1000 + 15×2000 + 45×3000 + 75×4000 + 200×5000)/15000
    expect(report.weightedDaysPastDue).toBe(Math.round((0 + 30000 + 135000 + 300000 + 1000000) / 15000));
  });

  it('rolls up per-customer aging', () => {
    const report = gen.generate([
      { invoiceId: 'a', customerId: 'c1', amountDue: 100, dueDateMs: clock.now() - 10 * DAY },
      { invoiceId: 'b', customerId: 'c1', amountDue: 200, dueDateMs: clock.now() - 50 * DAY },
      { invoiceId: 'c', customerId: 'c2', amountDue: 300, dueDateMs: clock.now() - 10 * DAY },
    ]);
    const c1 = report.byCustomer.find((x) => x.customerId === 'c1')!;
    expect(c1.total).toBe(300);
    expect(c1.bands.map((b) => b.band)).toEqual(['1-30', '31-60']);
    const c2 = report.byCustomer.find((x) => x.customerId === 'c2')!;
    expect(c2.bands.length).toBe(1);
  });

  it('empty input → empty report', () => {
    const r = gen.generate([]);
    expect(r.totalOutstanding).toBe(0);
    expect(r.weightedDaysPastDue).toBe(0);
    expect(r.byCustomer.length).toBe(0);
  });
});
