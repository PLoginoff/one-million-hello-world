/**
 * Dunning Manager
 *
 * State machine for recovering failed invoice payments. Models the classic
 * retry ladder used by Stripe/Chargebee: a configurable backoff schedule,
 * a maximum attempt count, and terminal states (`recovered` / `written-off`).
 *
 * States:
 *   none → pending-retry (first failure)
 *   pending-retry → retrying (retry dispatched)
 *   retrying → pending-retry (retry failed, more attempts left)
 *   retrying → exhausted (no attempts left)
 *   exhausted → written-off (manual close)
 *   any active → recovered (payment succeeded)
 *
 * The manager is purely a scheduler + state machine; the actual payment
 * attempt is delegated to a caller-supplied callback.
 *
 * @module BillingLayer/Metering
 */

import { Clock, DunningState, SystemClock } from './BillingTypes';

/** One step in the retry ladder. */
export interface RetryStep {
  /** Delay after the PREVIOUS attempt (ms). */
  readonly delayMs: number;
}

export interface DunningRecord {
  readonly invoiceId: string;
  readonly customerId: string;
  readonly amountDueCents: number;
  state: DunningState;
  /** Number of retries already dispatched (0 = not yet retried). */
  attempts: number;
  /** Timestamp of the next scheduled retry, or null if not scheduled. */
  nextRetryAt: number | null;
  readonly history: { at: number; from: DunningState; to: DunningState }[];
}

/**
 * Default ladder: retry at +1d, +3d, +5d, +7d (four attempts).
 */
export const DEFAULT_RETRY_SCHEDULE: readonly RetryStep[] = [
  { delayMs: 1 * 86_400_000 },
  { delayMs: 3 * 86_400_000 },
  { delayMs: 5 * 86_400_000 },
  { delayMs: 7 * 86_400_000 },
];

export class DunningManager {
  private readonly _records = new Map<string, DunningRecord>();

  constructor(
    private readonly _schedule: readonly RetryStep[] = DEFAULT_RETRY_SCHEDULE,
    private readonly _clock: Clock = new SystemClock()
  ) {}

  /**
   * Open a dunning record for a failed payment. The first retry is scheduled
   * at now + schedule[0].delayMs.
   */
  openCase(invoiceId: string, customerId: string, amountDueCents: number): DunningRecord {
    const existing = this._records.get(invoiceId);
    if (existing && existing.state !== 'recovered' && existing.state !== 'written-off') {
      return existing; // idempotent
    }
    const now = this._clock.now();
    const rec: DunningRecord = {
      invoiceId,
      customerId,
      amountDueCents,
      state: 'pending-retry',
      attempts: 0,
      nextRetryAt: now + this._schedule[0].delayMs,
      history: [{ at: now, from: 'none', to: 'pending-retry' }],
    };
    this._records.set(invoiceId, rec);
    return rec;
  }

  /**
   * All invoices whose retry is due at or before `now`.
   */
  dueRetries(now?: number): readonly DunningRecord[] {
    const t = now ?? this._clock.now();
    return Array.from(this._records.values()).filter(
      (r) => r.state === 'pending-retry' && r.nextRetryAt !== null && r.nextRetryAt <= t
    );
  }

  /**
   * Execute a retry attempt for an invoice due now. The `attempt` callback
   * performs the actual charge; on success the case closes `recovered`,
   * on failure the next step is scheduled (or the case is `exhausted`).
   *
   * Returns the updated record, or null if no retry was due.
   */
  async runRetry(
    invoiceId: string,
    attempt: (rec: DunningRecord) => Promise<boolean>
  ): Promise<DunningRecord | null> {
    const rec = this._records.get(invoiceId);
    if (!rec || rec.state !== 'pending-retry') return null;
    const now = this._clock.now();
    this._transition(rec, 'retrying');
    rec.attempts += 1;
    rec.nextRetryAt = null;

    let ok = false;
    try {
      ok = await attempt(rec);
    } catch {
      ok = false;
    }

    if (ok) {
      this._transition(rec, 'recovered');
      return rec;
    }
    const step = this._schedule[rec.attempts];
    if (step === undefined) {
      this._transition(rec, 'exhausted');
    } else {
      rec.nextRetryAt = now + step.delayMs;
      this._transition(rec, 'pending-retry');
    }
    return rec;
  }

  /**
   * Manually mark a case as recovered (e.g. paid out-of-band).
   */
  recover(invoiceId: string): DunningRecord | null {
    const rec = this._records.get(invoiceId);
    if (!rec || rec.state === 'recovered' || rec.state === 'written-off') return null;
    this._transition(rec, 'recovered');
    rec.nextRetryAt = null;
    return rec;
  }

  /**
   * Close an exhausted case as uncollectable.
   */
  writeOff(invoiceId: string): DunningRecord | null {
    const rec = this._records.get(invoiceId);
    if (!rec || rec.state !== 'exhausted') return null;
    this._transition(rec, 'written-off');
    return rec;
  }

  /** Fetch the state of a case. */
  record(invoiceId: string): DunningRecord | null {
    return this._records.get(invoiceId) ?? null;
  }

  /** All open (non-terminal) cases. */
  openCases(): readonly DunningRecord[] {
    return Array.from(this._records.values()).filter(
      (r) => r.state !== 'recovered' && r.state !== 'written-off'
    );
  }

  private _transition(rec: DunningRecord, to: DunningState): void {
    rec.history.push({ at: this._clock.now(), from: rec.state, to });
    rec.state = to;
  }
}
