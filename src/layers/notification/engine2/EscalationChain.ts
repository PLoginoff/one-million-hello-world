/**
 * Escalation Chain — ordered channel fallback on delivery failure.
 *
 * `delivery/` retries a failed send on the *same* channel with backoff.
 * The escalation chain answers the adjacent question: when a channel
 * is exhausted (or the user has no target for it), which channel do we
 * try next, and when? This is the classic paging pattern:
 *
 *   push ──fail 30s──► sms ──fail 60s──► email ──fail──► webhook
 *
 * The chain is a pure state machine — `recordOutcome` advances it, the
 * caller (delivery engine) executes each step. Per-notification state
 * is tracked so concurrent escalations don't interfere.
 *
 * @module NotificationLayer/Engine2
 */

import { Channel, Clock, SystemClock } from '../delivery/NotificationTypes';
import { ChainState, EscalationPlan } from './types';

interface Runtime {
  stepIndex: number;
  attemptOnStep: number;
  exhausted: boolean;
  nextAttemptAtMs?: number;
}

export type AttemptOutcome = 'sent' | 'retryable-failure' | 'terminal-failure' | 'no-target';

export class EscalationChain {
  private readonly _clock: Clock;
  private readonly _plans = new Map<string, EscalationPlan>();
  /** notificationId → runtime position. */
  private readonly _states = new Map<string, Runtime & { planName: string }>();

  constructor(clock: Clock = new SystemClock()) {
    this._clock = clock;
  }

  registerPlan(plan: EscalationPlan): void {
    if (plan.steps.length === 0) throw new Error('escalation plan needs ≥1 step');
    this._plans.set(plan.name, plan);
  }

  /**
   * Start a notification on a plan. Returns the first channel to try.
   */
  begin(notificationId: string, planName: string): ChainState {
    const plan = this._plans.get(planName);
    if (!plan) throw new Error(`unknown escalation plan "${planName}"`);
    const rt: Runtime & { planName: string } = {
      planName,
      stepIndex: 0,
      attemptOnStep: 0,
      exhausted: false,
      nextAttemptAtMs: this._clock.now(),
    };
    this._states.set(notificationId, rt);
    return this._snapshot(notificationId, plan, rt);
  }

  /**
   * Record the result of an attempt and compute the next step.
   * 'sent' terminates the chain successfully.
   */
  recordOutcome(notificationId: string, outcome: AttemptOutcome): ChainState {
    const rt = this._states.get(notificationId);
    if (!rt) throw new Error(`no escalation state for "${notificationId}"`);
    const plan = this._plans.get(rt.planName);
    if (!plan || rt.exhausted) return this._snapshot(notificationId, plan!, rt!);

    if (outcome === 'sent') {
      rt.exhausted = true;
      rt.nextAttemptAtMs = undefined;
      return this._snapshot(notificationId, plan, rt);
    }

    rt.attemptOnStep += 1;
    const step = plan.steps[rt.stepIndex];
    const stepDone =
      outcome === 'terminal-failure' ||
      outcome === 'no-target' ||
      rt.attemptOnStep >= step.maxAttempts;

    if (!stepDone) {
      // Same-channel retry via the step's delay.
      rt.nextAttemptAtMs = this._clock.now() + step.afterFailureDelayMs;
      return this._snapshot(notificationId, plan, rt);
    }
    // Move to the next channel.
    rt.stepIndex += 1;
    rt.attemptOnStep = 0;
    if (rt.stepIndex >= plan.steps.length) {
      rt.exhausted = true;
      rt.nextAttemptAtMs = undefined;
      return this._snapshot(notificationId, plan, rt);
    }
    rt.nextAttemptAtMs = this._clock.now() + step.afterFailureDelayMs;
    return this._snapshot(notificationId, plan, rt);
  }

  /** Is this notification due for its next attempt? */
  due(notificationId: string): boolean {
    const rt = this._states.get(notificationId);
    if (!rt || rt.exhausted || rt.nextAttemptAtMs === undefined) return false;
    return this._clock.now() >= rt.nextAttemptAtMs;
  }

  /** All notifications due for an attempt right now. */
  dueNow(): string[] {
    const out: string[] = [];
    for (const [id, rt] of this._states) {
      if (!rt.exhausted && rt.nextAttemptAtMs !== undefined && this._clock.now() >= rt.nextAttemptAtMs) {
        out.push(id);
      }
    }
    return out;
  }

  /** Current position snapshot for a notification. */
  state(notificationId: string): ChainState | undefined {
    const rt = this._states.get(notificationId);
    if (!rt) return undefined;
    const plan = this._plans.get(rt.planName);
    if (!plan) return undefined;
    return this._snapshot(notificationId, plan, rt);
  }

  /** Forget a notification (delivered or abandoned). */
  end(notificationId: string): void {
    this._states.delete(notificationId);
  }

  private _snapshot(_id: string, plan: EscalationPlan, rt: Runtime): ChainState {
    const step = rt.exhausted ? undefined : plan.steps[rt.stepIndex];
    return {
      planName: plan.name,
      stepIndex: rt.stepIndex,
      attemptOnStep: rt.attemptOnStep,
      exhausted: rt.exhausted,
      nextChannel: step?.channel,
      nextAttemptAtMs: rt.nextAttemptAtMs,
    };
  }
}

/** Convenience: the standard push → sms → email paging ladder. */
export function standardEscalation(name = 'standard'): EscalationPlan {
  return {
    name,
    steps: [
      { channel: 'push', afterFailureDelayMs: 30_000, maxAttempts: 2 },
      { channel: 'sms', afterFailureDelayMs: 60_000, maxAttempts: 2 },
      { channel: 'email', afterFailureDelayMs: 5 * 60_000, maxAttempts: 1 },
      { channel: 'webhook', afterFailureDelayMs: 0, maxAttempts: 1 },
    ],
  };
}
