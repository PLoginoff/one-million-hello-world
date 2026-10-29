/**
 * Billing Engine
 *
 * High-level facade composing every metering module into a usable API:
 *
 *   recordUsage()      → UsageMeter (idempotent ingest)
 *   subscribe()        → registers a plan for a customer
 *   changePlan()       → mid-cycle plan change with automatic proration
 *   issueInvoice()     → aggregates + prices + applies credits
 *   issueCredit()      → promotional credits via CreditLedger
 *   paymentFailed()    → opens a dunning case
 *   runDunning()       → dispatches due retries through a payment callback
 *
 * The engine is deliberately storage-free: it composes the in-memory
 * components and can be rehydrated by replaying usage events.
 *
 * @module BillingLayer/Metering
 */

import {
  BillingPeriod,
  Clock,
  CreditEntry,
  Invoice,
  MeteringError,
  Plan,
  ProrationRequest,
  SystemClock,
  UsageEvent,
} from './BillingTypes';
import { UsageMeter, periodFor } from './UsageMeter';
import { CreditLedger } from './CreditLedger';
import { InvoiceBuilder } from './InvoiceBuilder';
import { ProrationEngine } from './ProrationEngine';
import { DunningManager, DunningRecord, RetryStep, DEFAULT_RETRY_SCHEDULE } from './DunningManager';
import { BillingCalendar } from './BillingCalendar';
import { pricePlan } from './PricingEngine';

/** One active subscription: customer × plan, with an optional start date. */
export interface Subscription {
  readonly customerId: string;
  plan: Plan;
  readonly startedAt: number;
}

/**
 * Payment gateway abstraction used by dunning. Return true on a captured
 * charge. Throwing is treated as a failure.
 */
export type PaymentAttempt = (record: DunningRecord) => Promise<boolean>;

export class BillingEngine {
  readonly meter = new UsageMeter();
  readonly ledger = new CreditLedger();
  readonly proration = new ProrationEngine();
  readonly calendar = new BillingCalendar();
  readonly dunning: DunningManager;

  private readonly _subscriptions = new Map<string, Subscription>();
  private readonly _invoices = new Map<string, Invoice>();
  private _invoiceSeq = 0;

  constructor(
    private readonly _clock: Clock = new SystemClock(),
    retrySchedule: readonly RetryStep[] = DEFAULT_RETRY_SCHEDULE
  ) {
    this.dunning = new DunningManager(retrySchedule, _clock);
  }

  // ------------------------------------------------------------ usage ingest

  /**
   * Record usage; returns false on duplicate idempotency key.
   */
  recordUsage(event: UsageEvent): boolean {
    return this.meter.record(event);
  }

  /** Batch ingest; returns number of new events. */
  recordUsageBatch(events: readonly UsageEvent[]): number {
    return this.meter.recordBatch(events);
  }

  // ------------------------------------------------------------ subscription

  /**
   * Attach a plan to a customer starting now. One active plan per customer —
   * call {@link changePlan} to switch mid-cycle.
   */
  subscribe(customerId: string, plan: Plan): Subscription {
    const existing = this._subscriptions.get(customerId);
    if (existing) {
      throw new MeteringError(
        'INVALID_PLAN',
        `customer ${customerId} already subscribed to ${existing.plan.planId}; use changePlan`
      );
    }
    const sub: Subscription = { customerId, plan, startedAt: this._clock.now() };
    this._subscriptions.set(customerId, sub);
    return sub;
  }

  /**
   * Mid-cycle plan change. Produces a proration adjustment that is attached
   * to the CURRENT open invoice (or carried forward if none yet).
   *
   * If both plans price the same meter, the proration is computed from the
   * plans' effective unit prices; otherwise we treat it as a simple swap with
   * no financial adjustment (caller can add manual lines instead).
   */
  changePlan(customerId: string, newPlan: Plan, effectiveAt?: number): ProrationRequest | null {
    const sub = this._subscriptions.get(customerId);
    if (!sub) {
      throw new MeteringError('NO_PLAN', `no subscription for ${customerId}`);
    }
    const at = effectiveAt ?? this._clock.now();
    const oldPlan = sub.plan;

    // Only prorate when both plans price identically-shaped quantities.
    if (
      oldPlan.meter === newPlan.meter &&
      oldPlan.pricing.kind === 'flat' &&
      newPlan.pricing.kind === 'flat'
    ) {
      const period = periodFor(at, oldPlan.periodKind);
      const result = this.proration.prorate(period, {
        effectiveAt: at,
        oldUnitPriceCents: oldPlan.pricing.unitPriceCents,
        newUnitPriceCents: newPlan.pricing.unitPriceCents,
        oldQuantity: 1,
        newQuantity: 1,
      });
      // Stash the adjustment on a pending-proration list consumed by
      // issueInvoice(); keyed per customer.
      this._pendingProrations(customerId).push(result);
    }
    sub.plan = newPlan;
    return {
      effectiveAt: at,
      oldUnitPriceCents:
        oldPlan.pricing.kind === 'flat' ? oldPlan.pricing.unitPriceCents : 0,
      newUnitPriceCents:
        newPlan.pricing.kind === 'flat' ? newPlan.pricing.unitPriceCents : 0,
      oldQuantity: 1,
      newQuantity: 1,
    };
  }

  /** Currently active plan for a customer, or null. */
  subscription(customerId: string): Subscription | null {
    return this._subscriptions.get(customerId) ?? null;
  }

  // ------------------------------------------------------------ invoicing

  /**
   * Build and finalize an invoice for the CURRENT period of `customerId`'s
   * plan. Applies pending prorations and credit balance.
   */
  issueInvoice(customerId: string): Invoice {
    const sub = this._subscriptions.get(customerId);
    const period = this.calendar.periodContaining(
      this._clock.now(),
      sub?.plan.periodKind ?? { kind: 'calendar' }
    );
    return this.issueInvoiceForPeriod(customerId, period);
  }

  /**
   * Build an invoice for an arbitrary (usually already-closed) period.
   */
  issueInvoiceForPeriod(customerId: string, period: BillingPeriod): Invoice {
    const id = `inv-${++this._invoiceSeq}`;
    const builder = new InvoiceBuilder(this.meter, this.ledger, id, customerId, period);

    // Gather plans to price: the active subscription plus any plans the
    // customer has metered usage for under their meter name.
    const plans = new Map<string, Plan>();
    const sub = this._subscriptions.get(customerId);
    if (sub) plans.set(sub.plan.meter, sub.plan);
    for (const p of this._extraPlans.get(customerId) ?? []) {
      plans.set(p.meter, p);
    }
    builder.addUsage(plans);

    for (const pr of this._pendingProrations(customerId)) {
      builder.addProration(pr);
    }
    this._pendingProrations(customerId).length = 0;

    const inv = builder.finalize();
    this._invoices.set(inv.invoiceId, inv);
    return inv;
  }

  /** Look up a finalized invoice. */
  invoice(invoiceId: string): Invoice | null {
    return this._invoices.get(invoiceId) ?? null;
  }

  // ------------------------------------------------------------ credits

  /**
   * Issue a promotional credit. Idempotent on `creditId`.
   */
  issueCredit(entry: CreditEntry): boolean {
    return this.ledger.issue(entry);
  }

  /** Customer credit balance (negative = amount due). */
  creditBalance(customerId: string): number {
    return this.ledger.balance(customerId);
  }

  // ------------------------------------------------------------ payments & dunning

  /**
   * Simulate a charge attempt; on failure open a dunning case and record a
   * debit in the credit ledger so the balance goes negative.
   */
  recordPaymentFailure(invoiceId: string): DunningRecord | null {
    const inv = this._invoices.get(invoiceId);
    if (!inv) return null;
    const rec = this.dunning.openCase(invoiceId, inv.customerId, inv.amountDueCents);
    this.ledger.recordDebit(inv.customerId, `debit-${invoiceId}`, inv.amountDueCents, 'payment-failed');
    return rec;
  }

  /**
   * Dispatch every due retry through `attempt`. Returns the updated records.
   */
  async runDunning(attempt: PaymentAttempt): Promise<readonly DunningRecord[]> {
    const out: DunningRecord[] = [];
    for (const rec of this.dunning.dueRetries()) {
      const r = await this.dunning.runRetry(rec.invoiceId, attempt);
      if (r) {
        out.push(r);
        if (r.state === 'recovered') {
          // Balance out the earlier debit.
          this.ledger.issue({
            creditId: `recovery-${r.invoiceId}`,
            customerId: r.customerId,
            amountCents: r.amountDueCents,
            issuedAt: this._clock.now(),
            reason: 'payment-recovered',
          });
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------ internals

  /** Pending (not yet invoiced) prorations per customer. */
  private readonly _pending = new Map<string, { amountCents: number; description: string; remainingDays: number; totalDays: number }[]>();
  /** Additional billable plans beyond the subscription (overage meters). */
  private readonly _extraPlans = new Map<string, Plan[]>();

  /**
   * Register a secondary plan whose meter should also be invoiced for
   * `customerId` (e.g. an overage meter billed alongside a seat plan).
   */
  addOveragePlan(customerId: string, plan: Plan): void {
    let list = this._extraPlans.get(customerId);
    if (!list) {
      list = [];
      this._extraPlans.set(customerId, list);
    }
    list.push(plan);
  }

  private _pendingProrations(customerId: string) {
    let list = this._pending.get(customerId);
    if (!list) {
      list = [];
      this._pending.set(customerId, list);
    }
    return list;
  }
}
