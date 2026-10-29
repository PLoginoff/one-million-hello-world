/**
 * BillingEngine end-to-end tests — subscribe, meter, invoice, dunning (bun:test)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { BillingEngine } from '../metering/BillingEngine';
import { Clock, Plan, UsageEvent } from '../metering/BillingTypes';

function fakeClock(start = Date.UTC(2024, 0, 1)): Clock & { advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

const seatPlan: Plan = {
  planId: 'seats', meter: 'seat-count',
  pricing: { kind: 'flat', unitPriceCents: 1200 },
  periodKind: { kind: 'calendar' },
};

const apiPlan: Plan = {
  planId: 'api', meter: 'api-calls',
  pricing: {
    kind: 'graduated',
    tiers: [
      { from: 0, to: 1000, unitPriceCents: 1 },
      { from: 1000, to: null, unitPriceCents: 0 },
    ],
  },
  periodKind: { kind: 'calendar' },
};

const T0 = Date.UTC(2024, 0, 1);
const DAY = 86_400_000;

function ev(customerId: string, key: string, meter: string, qty: number, at = T0 + 1000): UsageEvent {
  return { customerId, idempotencyKey: key, meter, quantity: qty, occurredAt: at };
}

describe('BillingEngine', () => {
  let clock: ReturnType<typeof fakeClock>;
  let engine: BillingEngine;
  beforeEach(() => {
    clock = fakeClock(T0);
    engine = new BillingEngine(clock);
  });

  it('full lifecycle: subscribe → meter → invoice', () => {
    engine.subscribe('acme', seatPlan);
    engine.recordUsage(ev('acme', 'k1', 'seat-count', 5));
    const inv = engine.issueInvoice('acme');
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0].meter).toBe('seat-count');
    expect(inv.amountDueCents).toBe(5 * 1200);
  });

  it('idempotent ingest across retries', () => {
    engine.subscribe('acme', apiPlan);
    const e = ev('acme', 'same-key', 'api-calls', 500);
    expect(engine.recordUsage(e)).toBe(true);
    expect(engine.recordUsage(e)).toBe(false);
    expect(engine.recordUsageBatch([e, { ...e, idempotencyKey: 'k2' }])).toBe(1);
    const inv = engine.issueInvoice('acme');
    // 'same-key' stored once (500) + 'k2' (500) = 1000 units → 1000 × 1¢ = 1000.
    expect(inv.totalCents).toBe(1000);
  });

  it('overage plans are priced alongside the subscription', () => {
    engine.subscribe('acme', seatPlan);
    engine.addOveragePlan('acme', apiPlan);
    engine.recordUsage(ev('acme', 's', 'seat-count', 2));
    engine.recordUsage(ev('acme', 'a', 'api-calls', 3000));
    const inv = engine.issueInvoice('acme');
    const meters = inv.lines.map((l) => l.meter).sort();
    expect(meters).toEqual(['api-calls', 'seat-count']);
    // api: 1000×1¢ + 2000×0¢ = 1000; seats: 2400 → 3400
    expect(inv.totalCents).toBe(3400);
  });

  it('mid-cycle plan change produces a proration line', () => {
    engine.subscribe('acme', seatPlan);
    const pricier: Plan = { ...seatPlan, planId: 'seats-pro', pricing: { kind: 'flat', unitPriceCents: 2400 } };
    clock.advance(15 * DAY); // Jan 16
    engine.changePlan('acme', pricier);
    engine.recordUsage(ev('acme', 'k', 'seat-count', 1, clock.now()));
    const inv = engine.issueInvoice('acme');
    const proLine = inv.lines.find((l) => l.isProration);
    expect(proLine).toBeDefined();
    expect(proLine!.amountCents).toBeGreaterThan(0); // upgrade → charge
  });

  it('credits reduce the amount due', () => {
    engine.subscribe('acme', seatPlan);
    engine.recordUsage(ev('acme', 'k', 'seat-count', 1));
    engine.issueCredit({ creditId: 'promo', customerId: 'acme', amountCents: 500, issuedAt: T0, reason: 'launch' });
    const inv = engine.issueInvoice('acme');
    expect(inv.totalCents).toBe(1200);
    expect(inv.creditsAppliedCents).toBe(500);
    expect(inv.amountDueCents).toBe(700);
    expect(engine.creditBalance('acme')).toBe(0);
  });

  it('dunning lifecycle: failure → retries → recovery', async () => {
    const schedule = [{ delayMs: 100 }, { delayMs: 200 }];
    engine = new BillingEngine(clock, schedule);
    engine.subscribe('acme', seatPlan);
    engine.recordUsage(ev('acme', 'k', 'seat-count', 1));
    const inv = engine.issueInvoice('acme');

    engine.recordPaymentFailure(inv.invoiceId);
    expect(engine.creditBalance('acme')).toBe(-1200); // debit recorded

    let attempt = 0;
    clock.advance(100);
    const first = await engine.runDunning(async () => (++attempt === 2));
    expect(first).toHaveLength(1);
    expect(first[0].state).toBe('pending-retry'); // first attempt failed

    clock.advance(200);
    const second = await engine.runDunning(async () => true);
    expect(second[0].state).toBe('recovered');
    expect(engine.creditBalance('acme')).toBe(0); // recovery credit offset debit
  });

  it('dunning exhausts after all retries fail', async () => {
    engine = new BillingEngine(clock, [{ delayMs: 10 }]);
    engine.subscribe('acme', seatPlan);
    engine.recordUsage(ev('acme', 'k', 'seat-count', 1));
    const inv = engine.issueInvoice('acme');
    engine.recordPaymentFailure(inv.invoiceId);
    clock.advance(10);
    await engine.runDunning(async () => false);
    expect(engine.dunning.record(inv.invoiceId)!.state).toBe('exhausted');
    expect(engine.dunning.writeOff(inv.invoiceId)!.state).toBe('written-off');
  });
});
