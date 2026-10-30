/**
 * DLQ Retention Policy
 *
 * Time-based expiry for dead-letter records — the counterpart to
 * replay scheduling that keeps a queue from being an infinite pile.
 * Each queue gets a `maxAgeMs`: pending records older than that are
 * expired — moved to an expired state for the caller to purge or
 * archive (this module flags; the store owns the bytes).
 *
 * Options:
 *   - `maxAgeMs` — records older than this expire.
 *   - `maxAttempts` — records at/past attempts expire regardless of age
 *     (poison that keeps failing isn't worth keeping fresh).
 *   - `graceMs` — extra head-room given to records already claimed
 *     (in-flight replays don't expire mid-flight).
 *
 * `enforce` returns the expired ids per queue and marks them — it is
 * idempotent and safe to call on a cadence.
 *
 * @module DeadLetterLayer/Engine2
 */

import { DlqClock2, Engine2Record, SystemDlqClock2 } from './types';
import { RecordStore } from './RecordStore';

export interface RetentionPolicy {
  readonly maxAgeMs: number;
  readonly maxAttempts?: number;
  readonly graceMs?: number;
}

export interface RetentionReport {
  readonly queue: string;
  readonly expired: readonly string[];
  readonly kept: number;
}

export class RetentionEnforcer {
  private readonly _store: RecordStore;
  private readonly _clock: DlqClock2;
  private readonly _policy: RetentionPolicy;

  constructor(store: RecordStore, policy: RetentionPolicy, clock: DlqClock2 = new SystemDlqClock2()) {
    if (policy.maxAgeMs <= 0) throw new Error('maxAgeMs must be positive');
    this._store = store;
    this._policy = policy;
    this._clock = clock;
  }

  /** Is this record expired right now under the policy? */
  expired(record: Pick<Engine2Record, 'enqueuedAt' | 'attempts'>): boolean {
    if (
      this._policy.maxAttempts !== undefined &&
      record.attempts >= this._policy.maxAttempts
    ) {
      return true;
    }
    return this._clock.now() - record.enqueuedAt >= this._policy.maxAgeMs;
  }

  /**
   * Expire old pending records by quarantining them — the store's
   * existing "out of the live set" state, which keeps the bytes for
   * audit while removing them from replay eligibility. Returns ids.
   */
  enforce(queue: string): RetentionReport {
    const now = this._clock.now();
    const grace = this._policy.graceMs ?? 0;
    const expired: string[] = [];
    for (const rec of this._store.list(queue, 'pending')) {
      if (!this.expired(rec)) continue;
      // Records enqueued within graceMs still get their shot even if aged.
      if (grace > 0 && now - rec.enqueuedAt < this._policy.maxAgeMs + grace) {
        continue;
      }
      this._store.quarantine(rec.id);
      expired.push(rec.id);
    }
    return {
      queue,
      expired,
      kept: this._store.depth(queue, 'pending'),
    };
  }

  /** Run across every queue in the store. */
  enforceAll(): RetentionReport[] {
    return this._store.queues().map((q) => this.enforce(q));
  }
}
