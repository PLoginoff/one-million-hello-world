/**
 * Poison-Message Quarantine
 *
 * Permanent parking for records that must never be replayed
 * automatically — the messages that crash the consumer every pass or
 * carry payloads a human must judge before anyone presses "replay".
 * Quarantined records leave the pending set entirely: replay
 * schedulers, depth metrics and age reports stop seeing them.
 *
 * The registry keeps the quarantine metadata (when, signature, note,
 * review trail) separate from the record itself so the store stays
 * transport-shaped. A record parks only from `pending`/`replaying` —
 * you cannot quarantine a replayed or transferred ghost.
 *
 * Review outcomes:
 *   - `release` → back to `pending` (wrongly parked; replayable).
 *   - `keep`    → stays parked; the review is recorded as a decision.
 *   - `purge`   → stays parked and flagged for deletion by the owning
 *                 system (this registry records the verdict; deletion
 *                 is the caller's job since payloads are opaque here).
 *
 * @module DeadLetterLayer/Engine2
 */

import {
  DlqClock2,
  QuarantineEntry,
  SystemDlqClock2,
} from './types';
import { RecordStore } from './RecordStore';
import { signatureOf } from './ErrorClusters';

export class QuarantineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuarantineError';
  }
}

export class QuarantineRegistry {
  private readonly _store: RecordStore;
  private readonly _clock: DlqClock2;
  private readonly _entries = new Map<string, QuarantineEntry>();

  constructor(store: RecordStore, clock: DlqClock2 = new SystemDlqClock2()) {
    this._store = store;
    this._clock = clock;
  }

  /** Park a record; throws when the id is unknown or already parked. */
  park(recordId: string, note?: string): QuarantineEntry {
    if (this._entries.has(recordId)) {
      throw new QuarantineError(`record '${recordId}' is already quarantined`);
    }
    const rec = this._store.get(recordId);
    if (!rec) throw new QuarantineError(`unknown record '${recordId}'`);
    this._store.quarantine(recordId);
    const entry: QuarantineEntry = {
      recordId,
      quarantinedAt: this._clock.now(),
      signature: signatureOf(rec),
      note,
    };
    this._entries.set(recordId, entry);
    return entry;
  }

  /** Park every record matching a signature — used after a cluster review. */
  parkBySignature(queue: string, signature: string, note?: string): QuarantineEntry[] {
    const parked: QuarantineEntry[] = [];
    for (const rec of this._store.list(queue, 'pending')) {
      if (signatureOf(rec) === signature) {
        parked.push(this.park(rec.id, note));
      }
    }
    return parked;
  }

  get isQuarantined(): (id: string) => boolean {
    return (id) => this._entries.has(id);
  }

  get(recordId: string): QuarantineEntry | undefined {
    return this._entries.get(recordId);
  }

  /** All parked records, oldest quarantine first. */
  list(): QuarantineEntry[] {
    return [...this._entries.values()].sort(
      (a, b) => a.quarantinedAt - b.quarantinedAt
    );
  }

  /** Parked entries awaiting review (no verdict yet). */
  pendingReview(): QuarantineEntry[] {
    return this.list().filter((e) => e.review === undefined);
  }

  /**
   * Record a human verdict. `release` moves the record back to pending
   * in the store; `keep`/`purge` leave it parked. A second review
   * replaces the first — the trail is the entry itself plus the store
   * state, not an append log (in-memory scope).
   */
  review(
    recordId: string,
    reviewer: string,
    verdict: 'release' | 'keep' | 'purge',
    comment?: string
  ): QuarantineEntry {
    const entry = this._entries.get(recordId);
    if (!entry) {
      throw new QuarantineError(`record '${recordId}' is not quarantined`);
    }
    const reviewed: QuarantineEntry = {
      ...entry,
      review: { at: this._clock.now(), reviewer, verdict, comment },
    };
    this._entries.set(recordId, reviewed);
    if (verdict === 'release') {
      this._entries.delete(recordId);
      this._store.release(recordId);
      return reviewed;
    }
    return reviewed;
  }

  /**
   * Entries whose records are parked on `queue` — quarantine metadata
   * joined back to queue scope for per-queue dashboards.
   */
  forQueue(queue: string): QuarantineEntry[] {
    const onQueue = new Set(this._store.list(queue, 'quarantined').map((r) => r.id));
    return this.list().filter((e) => onQueue.has(e.recordId));
  }
}
