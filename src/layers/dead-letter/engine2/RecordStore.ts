/**
 * In-memory Engine2 record store — the substrate every other module in
 * this directory works over.
 *
 * Records live in per-queue FIFO arrays with a head cursor (same
 * amortised-O(1) dequeue trick as the message-bus topology): state
 * transitions rewrite the record in place; scans for analytics and
 * eligibility are O(R) over the queue.
 *
 * The store enforces the state machine:
 *
 *   pending → replaying → replayed
 *     │  ↘                 ↘
 *     │    → quarantined → released → pending   (manual review)
 *     ↘                     ↘
 *     → transferred → (moved to another queue, new id)
 *
 * Anything else throws `RecordStateError`. `replaying` is a claim, not
 * a completion — `completeReplay`/`failReplay` settle it, and a crash
 * mid-replay is recovered with `releaseStaleClaims(maxAgeMs)`.
 *
 * @module DeadLetterLayer/Engine2
 */

import { DlqClock2, Engine2Record, RecordState, SystemDlqClock2 } from './types';

export class RecordStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordStateError';
  }
}

interface StoredRecord extends Engine2Record {
  state: RecordState;
  /** Clock value when the current claim began (replaying only). */
  claimedAt?: number;
}

export interface StoredView extends Engine2Record {
  readonly state: RecordState;
}

let nextId = 0;
export function _resetRecordIds(): void {
  nextId = 0;
}

export class RecordStore {
  private readonly _clock: DlqClock2;
  /** queue → append-only storage + head cursor. */
  private readonly _queues = new Map<string, { records: StoredRecord[]; head: number }>();
  /** id → (queue, index) for O(1) lookup; ids never relocate. */
  private readonly _index = new Map<string, { queue: string; index: number }>();

  constructor(clock: DlqClock2 = new SystemDlqClock2()) {
    this._clock = clock;
  }

  private _queue(name: string): { records: StoredRecord[]; head: number } {
    let q = this._queues.get(name);
    if (!q) {
      q = { records: [], head: 0 };
      this._queues.set(name, q);
    }
    return q;
  }

  /** Add a record; returns the assigned id. `record.id` may be '' — the store owns ids. */
  add(queue: string, record: Omit<Engine2Record, 'id' | 'queue'> & { id?: string }): string {
    const q = this._queue(queue);
    const id = record.id ?? `r${++nextId}`;
    if (this._index.has(id)) {
      throw new RecordStateError(`duplicate record id '${id}'`);
    }
    const stored: StoredRecord = { ...record, id, queue, state: 'pending' };
    q.records.push(stored);
    this._index.set(id, { queue, index: q.records.length - 1 });
    return id;
  }

  get(id: string): StoredView | undefined {
    const loc = this._index.get(id);
    if (!loc) return undefined;
    const r = this._queue(loc.queue).records[loc.index];
    return r ? { ...r } : undefined;
  }

  /** Live (non-compacted) records in FIFO order. */
  list(queue: string, state?: RecordState): StoredView[] {
    const q = this._queue(queue);
    const out: StoredView[] = [];
    for (let i = q.head; i < q.records.length; i++) {
      const r = q.records[i];
      if (r === undefined) continue;
      if (state === undefined || r.state === state) out.push({ ...r });
    }
    return out;
  }

  /** All records in every queue — for cross-queue analytics. */
  listAll(state?: RecordState): StoredView[] {
    const out: StoredView[] = [];
    for (const name of this._queues.keys()) out.push(...this.list(name, state));
    return out;
  }

  depth(queue: string, state?: RecordState): number {
    return this.list(queue, state).length;
  }

  queues(): string[] {
    return [...this._queues.keys()];
  }

  /**
   * Claim `n` pending records for replay, oldest first. Claimed records
   * move to `replaying` and are invisible to later claims until settled.
   */
  claimForReplay(queue: string, n: number, minAgeMs = 0): StoredView[] {
    const q = this._queue(queue);
    const now = this._clock.now();
    const claimed: StoredView[] = [];
    for (let i = q.head; i < q.records.length && claimed.length < n; i++) {
      const r = q.records[i];
      if (r === undefined || r.state !== 'pending') continue;
      if (minAgeMs > 0 && now - r.enqueuedAt < minAgeMs) continue;
      r.state = 'replaying';
      r.claimedAt = now;
      claimed.push({ ...r });
    }
    return claimed;
  }

  /** Settle a claimed record as replayed (it stays for audit but leaves the pending set). */
  completeReplay(id: string): void {
    this._transition(id, 'replaying', 'replayed');
  }

  /** Return a claimed record to pending — replay attempt failed. */
  failReplay(id: string): void {
    this._transition(id, 'replaying', 'pending');
  }

  /**
   * Recover claims whose `claimedAt` is older than `maxAgeMs` — the
   * analogue of visibility-timeout expiry. Returns recovered ids.
   */
  releaseStaleClaims(maxAgeMs: number): string[] {
    const cutoff = this._clock.now() - maxAgeMs;
    const out: string[] = [];
    for (const q of this._queues.values()) {
      for (const r of q.records) {
        if (r === undefined || r.state !== 'replaying' || r.claimedAt === undefined) continue;
        if (r.claimedAt <= cutoff) {
          r.state = 'pending';
          r.claimedAt = undefined;
          out.push(r.id);
        }
      }
    }
    return out;
  }

  /** Park a record for manual review; only pending or failed-claim records park. */
  quarantine(id: string): void {
    const rec = this._raw(id);
    if (rec.state !== 'pending' && rec.state !== 'replaying') {
      throw new RecordStateError(`cannot quarantine '${id}' from state '${rec.state}'`);
    }
    rec.state = 'quarantined';
    rec.claimedAt = undefined;
  }

  /** Manual review releases a quarantined record back to pending. */
  release(id: string): void {
    this._transition(id, 'quarantined', 'pending');
  }

  /** Mark a record as moved out; the destination side is a fresh `add`. */
  markTransferred(id: string): void {
    const rec = this._raw(id);
    if (rec.state !== 'pending' && rec.state !== 'quarantined') {
      throw new RecordStateError(`cannot transfer '${id}' from state '${rec.state}'`);
    }
    rec.state = 'transferred';
  }

  /**
   * Drop fully-settled records (replayed/transferred) older than the
   * queue's head so storage does not grow forever. Pending and
   * quarantined records always survive.
   */
  sweep(queue: string): number {
    const q = this._queue(queue);
    let removed = 0;
    const kept: StoredRecord[] = [];
    const retained: Array<{ r: StoredRecord; index: number }> = [];
    for (let i = q.head; i < q.records.length; i++) {
      const r = q.records[i];
      if (r === undefined) continue;
      if (r.state === 'replayed' || r.state === 'transferred') {
        removed++;
        this._index.delete(r.id);
      } else {
        retained.push({ r, index: kept.length });
        kept.push(r);
      }
    }
    q.records = kept;
    q.head = 0;
    for (const { r, index } of retained) {
      const loc = this._index.get(r.id);
      if (loc) loc.index = index;
    }
    return removed;
  }

  private _transition(id: string, from: RecordState, to: RecordState): void {
    const rec = this._raw(id);
    if (rec.state !== from) {
      throw new RecordStateError(
        `record '${id}' is '${rec.state}', expected '${from}'`
      );
    }
    rec.state = to;
    if (to !== 'replaying') rec.claimedAt = undefined;
  }

  private _raw(id: string): StoredRecord {
    const loc = this._index.get(id);
    if (!loc) throw new RecordStateError(`unknown record '${id}'`);
    const r = this._queue(loc.queue).records[loc.index];
    if (!r) throw new RecordStateError(`unknown record '${id}'`);
    return r;
  }
}
