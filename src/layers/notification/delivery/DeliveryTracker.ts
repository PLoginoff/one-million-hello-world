/**
 * Delivery Tracker
 *
 * Tracks the lifecycle of every notification → delivery record, including
 * provider-callback reconciliation (delivered / bounced) and retry state.
 *
 * Reconciliation model: providers call back asynchronously with
 * (providerId, status). The tracker maps providerId → record and applies
 * the state transition; unknown providerIds are logged as orphans so
 * operators can spot drift.
 *
 * @module NotificationLayer/Delivery
 */

import {
  Channel,
  Clock,
  DeliveryRecord,
  DeliveryState,
  SystemClock,
} from './NotificationTypes';

/** Provider callback payload. */
export interface ProviderCallback {
  readonly providerId: string;
  readonly status: 'delivered' | 'bounced' | 'failed';
  readonly at?: number;
}

export class DeliveryTracker {
  private readonly _records = new Map<string, DeliveryRecord>();
  private readonly _byProviderId = new Map<string, string>(); // providerId → notificationId
  readonly orphanCallbacks: ProviderCallback[] = [];

  constructor(private readonly _clock: Clock = new SystemClock()) {}

  /** Create a record in 'queued' state. */
  open(notificationId: string, userId: string, channel: Channel): DeliveryRecord {
    const rec: DeliveryRecord = {
      notificationId,
      userId,
      channel,
      state: 'queued',
      attempts: 0,
      nextAttemptAt: null,
      history: [{ at: this._clock.now(), from: 'queued', to: 'queued' }],
    };
    this._records.set(notificationId, rec);
    return rec;
  }

  /** Transition a record, appending history. */
  transition(notificationId: string, to: DeliveryState, note?: string): DeliveryRecord | null {
    const rec = this._records.get(notificationId);
    if (!rec) return null;
    rec.history.push({ at: this._clock.now(), from: rec.state, to, note });
    rec.state = to;
    return rec;
  }

  /** Mark rendered (template applied). */
  markRendered(notificationId: string): DeliveryRecord | null {
    return this.transition(notificationId, 'rendered');
  }

  /**
   * Mark dispatched to the provider; stores providerId for reconciliation
   * and schedules the next retry if `nextAttemptAt` given.
   */
  markSent(notificationId: string, providerId: string | undefined, nextAttemptAt: number | null): DeliveryRecord | null {
    const rec = this.transition(notificationId, 'sent');
    if (rec) {
      rec.attempts += 1;
      rec.nextAttemptAt = nextAttemptAt;
      if (providerId) {
        rec.providerId = providerId;
        this._byProviderId.set(providerId, notificationId);
      }
    }
    return rec;
  }

  /** Mark a scheduled retry (still unsent). */
  markDeferred(notificationId: string, nextAttemptAt: number, note?: string): DeliveryRecord | null {
    const rec = this.transition(notificationId, 'deferred', note);
    if (rec) rec.nextAttemptAt = nextAttemptAt;
    return rec;
  }

  /** Terminal failure (non-retryable, or exhausted). */
  markFailed(notificationId: string, note?: string): DeliveryRecord | null {
    return this.transition(notificationId, 'failed', note);
  }

  markSuppressed(notificationId: string, note?: string): DeliveryRecord | null {
    return this.transition(notificationId, 'suppressed', note);
  }

  markDigested(notificationId: string): DeliveryRecord | null {
    return this.transition(notificationId, 'digested');
  }

  /**
   * Reconcile a provider callback. Returns the updated record, or null if
   * the providerId is unknown (recorded as orphan).
   */
  reconcile(cb: ProviderCallback): DeliveryRecord | null {
    const nid = this._byProviderId.get(cb.providerId);
    if (!nid) {
      this.orphanCallbacks.push(cb);
      return null;
    }
    const to: DeliveryState =
      cb.status === 'delivered' ? 'delivered' :
      cb.status === 'bounced' ? 'bounced' : 'failed';
    return this.transition(nid, to, `provider-callback:${cb.status}`);
  }

  /** Records due for retry at `now`. */
  dueRetries(now?: number): readonly DeliveryRecord[] {
    const t = now ?? this._clock.now();
    return Array.from(this._records.values()).filter(
      (r) => r.state === 'deferred' && r.nextAttemptAt !== null && r.nextAttemptAt <= t
    );
  }

  get(notificationId: string): DeliveryRecord | null {
    return this._records.get(notificationId) ?? null;
  }

  /** Count of records in each state. */
  stats(): Record<DeliveryState, number> {
    const s: Record<DeliveryState, number> = {
      queued: 0, rendered: 0, sent: 0, delivered: 0, failed: 0,
      bounced: 0, deferred: 0, suppressed: 0, digested: 0,
    };
    for (const r of this._records.values()) s[r.state]++;
    return s;
  }
}
