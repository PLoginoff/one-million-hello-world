/**
 * Subscription Lifecycle State Machine
 *
 * Models the billing lifecycle as a guarded state machine:
 *
 *   trialing ──► active ──► past_due ──► canceled
 *      │           ▲          │
 *      └──► active │          ├──► active   (payment recovered)
 *                  └──────────┴──► canceled (dunning exhausted)
 *
 * Each transition emits a `LifecycleEvent`; dunning is a retry schedule
 * inside `past_due` — each failed payment attempt advances the schedule,
 * and exhausting it cancels the subscription. `noImplicitOverride`-
 * friendly: no inheritance involved.
 *
 * Time is injectable; all transitions are pure state changes driven by
 * explicit calls (`activate`, `failPayment`, `recordPayment`, `cancel`)
 * plus `tick(now)` for time-based transitions (trial end, grace expiry).
 *
 * @module BillingLayer/Engine2
 */

export type SubscriptionState = 'trialing' | 'active' | 'past_due' | 'canceled';

export type LifecycleEvent =
  | { type: 'trial_started'; at: number; trialEndsAt: number }
  | { type: 'activated'; at: number; fromTrial: boolean }
  | { type: 'payment_failed'; at: number; attempt: number; nextRetryAt?: number }
  | { type: 'payment_recovered'; at: number; afterAttempts: number }
  | { type: 'past_due_entered'; at: number; graceEndsAt: number }
  | { type: 'canceled'; at: number; reason: 'trial_expired' | 'dunning_exhausted' | 'voluntary' | 'grace_expired' }
  | { type: 'dunning_notice'; at: number; attempt: number };

export interface LifecycleConfig {
  /** Trial length in ms; 0 = no trial. */
  readonly trialMs?: number;
  /** Grace period in past_due before auto-cancel (ms). */
  readonly pastDueGraceMs?: number;
  /** Dunning retry offsets (ms after entering past_due). */
  readonly retryOffsetsMs?: readonly number[];
}

export interface Subscription {
  readonly id: string;
  readonly customerId: string;
  readonly planId: string;
  state: SubscriptionState;
  readonly startedAt: number;
  trialEndsAt?: number;
  /** When the current past_due period began (undefined elsewhere). */
  pastDueSince?: number;
  /** Failed payment attempts in the current dunning round. */
  dunningAttempts: number;
  readonly events: LifecycleEvent[];
  canceledAt?: number;
  cancelReason?: LifecycleEvent extends { reason: infer R } ? R : string;
}

const DEFAULT_RETRY_OFFSETS: readonly number[] = [
  24 * 3600_000, // +1d
  3 * 24 * 3600_000, // +3d
  7 * 24 * 3600_000, // +7d
];

export class LifecycleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'LifecycleError';
  }
}

export class SubscriptionLifecycle {
  private readonly _clock: { now(): number };
  private readonly _cfg: Required<LifecycleConfig>;
  private _seq = 0;
  private readonly _subs = new Map<string, Subscription>();

  constructor(clock: { now(): number }, config?: LifecycleConfig) {
    this._clock = clock;
    this._cfg = {
      trialMs: config?.trialMs ?? 0,
      pastDueGraceMs: config?.pastDueGraceMs ?? 14 * 24 * 3600_000,
      retryOffsetsMs: config?.retryOffsetsMs ?? DEFAULT_RETRY_OFFSETS,
    };
  }

  /** Create a subscription; starts trialing when trialMs > 0. */
  create(customerId: string, planId: string): Subscription {
    const now = this._clock.now();
    const trialing = this._cfg.trialMs > 0;
    const sub: Subscription = {
      id: `sub-${++this._seq}`,
      customerId,
      planId,
      state: trialing ? 'trialing' : 'active',
      startedAt: now,
      trialEndsAt: trialing ? now + this._cfg.trialMs : undefined,
      dunningAttempts: 0,
      events: [],
    };
    if (trialing) {
      sub.events.push({ type: 'trial_started', at: now, trialEndsAt: sub.trialEndsAt! });
    } else {
      sub.events.push({ type: 'activated', at: now, fromTrial: false });
    }
    this._subs.set(sub.id, sub);
    return sub;
  }

  get(id: string): Subscription {
    const s = this._subs.get(id);
    if (!s) throw new LifecycleError('NOT_FOUND', `unknown subscription ${id}`);
    return s;
  }

  private requireState(s: Subscription, ...states: SubscriptionState[]): void {
    if (!states.includes(s.state)) {
      throw new LifecycleError(
        'BAD_STATE',
        `subscription ${s.id} is ${s.state}, expected ${states.join('|')}`
      );
    }
  }

  /** Move trialing/active → past_due on a failed payment. */
  failPayment(id: string): Subscription {
    const s = this.get(id);
    this.requireState(s, 'active', 'past_due');
    const now = this._clock.now();
    if (s.state === 'active') {
      s.state = 'past_due';
      s.pastDueSince = now;
      s.dunningAttempts = 0;
      s.events.push({
        type: 'past_due_entered',
        at: now,
        graceEndsAt: now + this._cfg.pastDueGraceMs,
      });
    }
    s.dunningAttempts++;
    const nextOffset = this._cfg.retryOffsetsMs[s.dunningAttempts - 1];
    s.events.push({
      type: 'payment_failed',
      at: now,
      attempt: s.dunningAttempts,
      nextRetryAt: nextOffset !== undefined ? s.pastDueSince! + nextOffset : undefined,
    });
    return s;
  }

  /** Recover a past_due subscription on a successful payment. */
  recordPayment(id: string): Subscription {
    const s = this.get(id);
    this.requireState(s, 'past_due', 'active');
    const now = this._clock.now();
    if (s.state === 'past_due') {
      s.state = 'active';
      const attempts = s.dunningAttempts;
      s.dunningAttempts = 0;
      s.pastDueSince = undefined;
      s.events.push({ type: 'payment_recovered', at: now, afterAttempts: attempts });
    }
    return s;
  }

  /** Activate a trialing subscription (e.g. card added early). */
  activate(id: string): Subscription {
    const s = this.get(id);
    this.requireState(s, 'trialing');
    s.state = 'active';
    s.trialEndsAt = undefined;
    s.events.push({ type: 'activated', at: this._clock.now(), fromTrial: true });
    return s;
  }

  /** Voluntary cancel — immediate. */
  cancel(id: string, reason: 'voluntary' = 'voluntary'): Subscription {
    const s = this.get(id);
    if (s.state === 'canceled') {
      throw new LifecycleError('BAD_STATE', `${id} already canceled`);
    }
    s.state = 'canceled';
    s.canceledAt = this._clock.now();
    s.cancelReason = reason;
    s.events.push({ type: 'canceled', at: s.canceledAt, reason });
    return s;
  }

  /**
   * Advance time-based transitions: trial expiry and past-due grace.
   * Returns events emitted this tick.
   */
  tick(): readonly LifecycleEvent[] {
    const now = this._clock.now();
    const emitted: LifecycleEvent[] = [];
    for (const s of this._subs.values()) {
      if (s.state === 'trialing' && s.trialEndsAt !== undefined && now >= s.trialEndsAt) {
        // Trial ended without activation — auto-cancel.
        s.state = 'canceled';
        s.canceledAt = now;
        s.cancelReason = 'trial_expired';
        const ev: LifecycleEvent = { type: 'canceled', at: now, reason: 'trial_expired' };
        s.events.push(ev);
        emitted.push(ev);
      }
      if (
        s.state === 'past_due' &&
        s.pastDueSince !== undefined &&
        now - s.pastDueSince >= this._cfg.pastDueGraceMs
      ) {
        s.state = 'canceled';
        s.canceledAt = now;
        s.cancelReason = 'grace_expired';
        const ev: LifecycleEvent = { type: 'canceled', at: now, reason: 'grace_expired' };
        s.events.push(ev);
        emitted.push(ev);
      }
    }
    return emitted;
  }

  /** All subscriptions in a given state — dunning dashboards. */
  inState(state: SubscriptionState): readonly Subscription[] {
    return [...this._subs.values()].filter((s) => s.state === state);
  }
}
