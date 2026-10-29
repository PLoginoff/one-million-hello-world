/**
 * Billing metering engine — unit tests (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { UsageMeter, periodFor } from '../metering/UsageMeter';
import { BillingCalendar } from '../metering/BillingCalendar';
import {
  bankersRound,
  toMinorUnits,
  fromMinorUnits,
  pricePlan,
  priceQuantity,
  billableQuantity,
  validateTiers,
} from '../metering/PricingEngine';
import { ProrationEngine } from '../metering/ProrationEngine';
import { CreditLedger } from '../metering/CreditLedger';
import { InvoiceBuilder } from '../metering/InvoiceBuilder';
import { DunningManager, DEFAULT_RETRY_SCHEDULE } from '../metering/DunningManager';
import { Clock, MeteringError, Plan, UsageEvent } from '../metering/BillingTypes';

// ---------------------------------------------------------------- helpers

function fakeClock(start = 0): Clock & { advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

const T0 = Date.UTC(2024, 0, 1); // Jan 1 2024

function ev(customerId: string, key: string, meter: string, qty: number, at = T0, dims?: Record<string, string>): UsageEvent {
  return { customerId, idempotencyKey: key, meter, quantity: qty, occurredAt: at, dimensions: dims };
}

const flatPlan: Plan = {
  planId: 'p1', meter: 'api-calls',
  pricing: { kind: 'flat', unitPriceCents: 2 },
  periodKind: { kind: 'calendar' },
};

const graduatedPlan: Plan = {
  planId: 'p2', meter: 'gb',
  pricing: { kind: 'graduated', tiers: [
    { from: 0, to: 10, unitPriceCents: 100 },
    { from: 10, to: 50, unitPriceCents: 50 },
    { from: 50, to: null, unitPriceCents: 10 },
  ]},
  periodKind: { kind: 'calendar' },
};

// ---------------------------------------------------------------- UsageMeter

describe('UsageMeter', () => {
  let meter: UsageMeter;
  beforeEach(() => { meter = new UsageMeter(); });

  it('stores and deduplicates by idempotency key', () => {
    expect(meter.record(ev('c1', 'k1', 'api', 5))).toBe(true);
    expect(meter.record(ev('c1', 'k1', 'api', 5))).toBe(false);
    expect(meter.record(ev('c1', 'k2', 'api', 3))).toBe(true);
    expect(meter.eventCount('c1')).toBe(2);
  });

  it('dedup is per-customer', () => {
    expect(meter.record(ev('c1', 'k1', 'api', 1))).toBe(true);
    expect(meter.record(ev('c2', 'k1', 'api', 1))).toBe(true);
  });

  it('rejects invalid events', () => {
    expect(() => meter.record(ev('', 'k', 'm', 1))).toThrow(MeteringError);
    expect(() => meter.record(ev('c', 'k', 'm', NaN))).toThrow(MeteringError);
  });

  it('aggregates inside a period only', () => {
    const period = periodFor(T0, { kind: 'calendar' });
    meter.record(ev('c1', 'a', 'api', 10, period.start + 1000));
    meter.record(ev('c1', 'b', 'api', 20, period.end - 1));
    meter.record(ev('c1', 'c', 'api', 99, period.end)); // outside
    meter.record(ev('c1', 'd', 'other', 5, period.start + 1));
    expect(meter.aggregateForPeriod('c1', 'api', period)).toBe(30);
  });

  it('groups aggregates by meter and dimensions', () => {
    const period = periodFor(T0, { kind: 'calendar' });
    meter.record(ev('c1', 'a', 'api', 1, T0, { region: 'us' }));
    meter.record(ev('c1', 'b', 'api', 2, T0, { region: 'us' }));
    meter.record(ev('c1', 'c', 'api', 4, T0, { region: 'eu' }));
    meter.record(ev('c1', 'd', 'gb', 8, T0));
    const aggs = meter.aggregatesForPeriod('c1', period);
    const byMeter = new Map(aggs.map((a) => [`${a.meter}:${a.dimensions?.region ?? '-'}`, a.quantity]));
    expect(byMeter.get('api:us')).toBe(3);
    expect(byMeter.get('api:eu')).toBe(4);
    expect(byMeter.get('gb:-')).toBe(8);
  });
});

// ---------------------------------------------------------------- periods

describe('BillingCalendar periods', () => {
  const cal = new BillingCalendar();

  it('calendar month boundaries', () => {
    const p = periodFor(Date.UTC(2024, 1, 15), { kind: 'calendar' });
    expect(p.start).toBe(Date.UTC(2024, 1, 1));
    expect(p.end).toBe(Date.UTC(2024, 2, 1));
  });

  it('anniversary anchored before/after the day', () => {
    // anchor 15th: Jan 20 is inside Jan 15 → Feb 15
    const p = periodFor(Date.UTC(2024, 0, 20), { kind: 'anniversary', anchorDay: 15 });
    expect(p.start).toBe(Date.UTC(2024, 0, 15));
    expect(p.end).toBe(Date.UTC(2024, 1, 15));
    // Jan 10 is inside Dec 15 → Jan 15
    const q = periodFor(Date.UTC(2024, 0, 10), { kind: 'anniversary', anchorDay: 15 });
    expect(q.start).toBe(Date.UTC(2023, 11, 15));
    expect(q.end).toBe(Date.UTC(2024, 0, 15));
  });

  it('anchor clamps to short months (31 → Feb 29 in leap year)', () => {
    // Feb 28: still inside Jan 31 → Feb 29 (clamped end)
    const p = periodFor(Date.UTC(2024, 1, 28), { kind: 'anniversary', anchorDay: 31 });
    expect(p.start).toBe(Date.UTC(2024, 0, 31));
    expect(p.end).toBe(Date.UTC(2024, 1, 29));
    // Feb 29 noon: the clamped period already started at Feb 29 00:00
    const q = periodFor(Date.UTC(2024, 1, 29, 12), { kind: 'anniversary', anchorDay: 31 });
    expect(q.start).toBe(Date.UTC(2024, 1, 29));
    expect(q.end).toBe(Date.UTC(2024, 2, 31));
  });

  it('next/previous chain', () => {
    const cal2 = new BillingCalendar();
    const p0 = cal2.periodContaining(T0, { kind: 'calendar' });
    const p1 = cal2.nextPeriod(p0);
    expect(p1.start).toBe(p0.end);
    expect(cal2.previousPeriod(p1).start).toBe(p0.start);
  });
});

// ---------------------------------------------------------------- pricing

describe('PricingEngine', () => {
  it('banker\'s rounding splits ties evenly', () => {
    expect(bankersRound(0.5, 0)).toBe(0);
    expect(bankersRound(1.5, 0)).toBe(2);
    expect(bankersRound(2.5, 0)).toBe(2);
    expect(bankersRound(-2.5, 0)).toBe(-2);
    expect(bankersRound(1.005, 2)).toBe(1); // 1.005 → tie → 1.00 (even)
  });

  it('converts between major and minor units per currency', () => {
    expect(toMinorUnits(1.005, 'USD')).toBe(100); // tie → 100 (even)
    expect(toMinorUnits(1.015, 'USD')).toBe(102); // tie → 102 (even)
    expect(fromMinorUnits(1234, 'USD')).toBe(12.34);
    expect(toMinorUnits(123, 'JPY')).toBe(123);   // 0 decimals
    expect(toMinorUnits(1.2345, 'BHD')).toBe(1234); // 3 decimals
  });

  it('flat pricing', () => {
    expect(priceQuantity(7, { kind: 'flat', unitPriceCents: 3 })).toBe(21);
  });

  it('tiered (volume) applies best tier to all units', () => {
    const tiers = [
      { from: 0, to: 10, unitPriceCents: 100 },
      { from: 10, to: null, unitPriceCents: 50 },
    ];
    // 15 units → entire 15 @ 50¢ = 750
    expect(priceQuantity(15, { kind: 'tiered', tiers })).toBe(750);
    expect(priceQuantity(5, { kind: 'tiered', tiers })).toBe(500);
  });

  it('graduated applies marginal rates per bracket', () => {
    // 60 units: 10@100 + 40@50 + 10@10 = 1000+2000+100 = 3100
    expect(priceQuantity(60, graduatedPlan.pricing)).toBe(3100);
  });

  it('package pricing rounds up to whole packages', () => {
    const p = { kind: 'package' as const, unitsPerPackage: 10, packagePriceCents: 500 };
    expect(priceQuantity(1, p)).toBe(500);
    expect(priceQuantity(10, p)).toBe(500);
    expect(priceQuantity(11, p)).toBe(1000);
  });

  it('free allowance is burned down first', () => {
    const plan: Plan = { ...flatPlan, freeQuantity: 100 };
    expect(billableQuantity(80, plan)).toBe(0);
    expect(billableQuantity(120, plan)).toBe(20);
  });

  it('rejects non-contiguous tiers', () => {
    expect(() =>
      validateTiers([
        { from: 0, to: 10, unitPriceCents: 1 },
        { from: 20, to: null, unitPriceCents: 1 },
      ])
    ).toThrow(MeteringError);
  });
});

// ---------------------------------------------------------------- proration

describe('ProrationEngine', () => {
  const engine = new ProrationEngine();
  const period = { start: Date.UTC(2024, 0, 1), end: Date.UTC(2024, 1, 1), kind: { kind: 'calendar' as const } };

  it('mid-month upgrade charges the difference', () => {
    // 31-day period, change on Jan 16 → 16 days remaining (16→31 inclusive of endDay diff)
    const r = engine.prorateSeats(period, Date.UTC(2024, 0, 16), 1000, 5, 10);
    // oldDaily=5000/31, newDaily=10000/31; diff ≈ 161.29¢/day × 16d ≈ 2580¢
    expect(r.amountCents).toBe(Math.round(((10000 - 5000) / 31) * 16));
    expect(r.amountCents).toBeGreaterThan(0);
    expect(r.remainingDays).toBe(16);
  });

  it('downgrade yields a negative (credit) amount', () => {
    const r = engine.prorateSeats(period, Date.UTC(2024, 0, 16), 1000, 10, 5);
    expect(r.amountCents).toBeLessThan(0);
    expect(r.description).toContain('credit');
  });

  it('rejects effectiveAt outside the period', () => {
    expect(() =>
      engine.prorate(period, {
        effectiveAt: period.end + 1,
        oldUnitPriceCents: 1, newUnitPriceCents: 1,
        oldQuantity: 1, newQuantity: 2,
      })
    ).toThrow();
  });
});

// ---------------------------------------------------------------- credits + invoice

describe('CreditLedger', () => {
  it('issues, applies FIFO, and tracks balance', () => {
    const l = new CreditLedger();
    l.issue({ creditId: 'a', customerId: 'c', amountCents: 500, issuedAt: 0, reason: 'promo' });
    l.issue({ creditId: 'b', customerId: 'c', amountCents: 300, issuedAt: 1, reason: 'promo' });
    expect(l.balance('c')).toBe(800);
    expect(l.apply('c', 600)).toBe(600); // eats all of 'a', 100 of 'b'
    expect(l.balance('c')).toBe(200);
    expect(l.apply('c', 999)).toBe(200);
    expect(l.balance('c')).toBe(0);
  });

  it('debit pushes balance negative', () => {
    const l = new CreditLedger();
    l.recordDebit('c', 'd1', 400, 'chargeback');
    expect(l.balance('c')).toBe(-400);
    expect(l.apply('c', 100)).toBe(0); // negative balance → nothing to apply
  });
});

describe('InvoiceBuilder', () => {
  it('builds lines per meter×dims and applies credits', () => {
    const meter = new UsageMeter();
    const ledger = new CreditLedger();
    const period = periodFor(T0, { kind: 'calendar' });
    meter.record(ev('c1', 'a', 'api-calls', 100, T0 + 1));
    ledger.issue({ creditId: 'cr', customerId: 'c1', amountCents: 50, issuedAt: 0, reason: 'promo' });

    const inv = new InvoiceBuilder(meter, ledger, 'inv-1', 'c1', period)
      .addUsage(new Map([['api-calls', flatPlan]]))
      .finalize();

    expect(inv.totalCents).toBe(200);
    expect(inv.creditsAppliedCents).toBe(50);
    expect(inv.amountDueCents).toBe(150);
    expect(inv.lines).toHaveLength(1);
  });

  it('proration line appears flagged', () => {
    const meter = new UsageMeter();
    const inv = new InvoiceBuilder(meter, new CreditLedger(), 'i', 'c', periodFor(T0, { kind: 'calendar' }))
      .addProration({ amountCents: -300, description: 'x', remainingDays: 5, totalDays: 31 })
      .finalize();
    expect(inv.lines[0].isProration).toBe(true);
    expect(inv.totalCents).toBe(-300);
    expect(inv.amountDueCents).toBe(-300); // negative → credit balance
  });
});

// ---------------------------------------------------------------- dunning

describe('DunningManager', () => {
  it('walks the retry ladder to exhausted', async () => {
    const clock = fakeClock(1_000);
    const dm = new DunningManager(DEFAULT_RETRY_SCHEDULE, clock);
    dm.openCase('inv1', 'c1', 1000);

    for (let i = 0; i < DEFAULT_RETRY_SCHEDULE.length; i++) {
      const due = dm.dueRetries(clock.now());
      // advance to next retry time if needed
      const rec = dm.record('inv1')!;
      if (rec.nextRetryAt !== null && rec.nextRetryAt > clock.now()) {
        clock.advance(rec.nextRetryAt - clock.now());
      }
      const r = await dm.runRetry('inv1', async () => false);
      expect(r).not.toBeNull();
      if (i < DEFAULT_RETRY_SCHEDULE.length - 1) {
        expect(r!.state).toBe('pending-retry');
      }
    }
    expect(dm.record('inv1')!.state).toBe('exhausted');
    expect(dm.record('inv1')!.attempts).toBe(4);
  });

  it('recovers on successful retry', async () => {
    const clock = fakeClock(0);
    const dm = new DunningManager([{ delayMs: 100 }], clock);
    dm.openCase('i', 'c', 5);
    clock.advance(100);
    const r = await dm.runRetry('i', async () => true);
    expect(r!.state).toBe('recovered');
    expect(dm.openCases()).toHaveLength(0);
  });

  it('write-off only allowed from exhausted', async () => {
    const dm = new DunningManager([{ delayMs: 1 }], fakeClock(0));
    dm.openCase('i', 'c', 5);
    expect(dm.writeOff('i')).toBeNull(); // not exhausted yet
  });
});
