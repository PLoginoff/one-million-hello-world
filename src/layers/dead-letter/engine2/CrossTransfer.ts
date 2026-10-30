/**
 * Cross-DLQ Transfer
 *
 * Moves records between dead-letter queues — e.g. routing a class of
 * failures into a specialist queue, or draining a wrongly-addressed
 * DLQ back to where a fixed consumer can replay it.
 *
 * The transfer is copy-then-mark inside one in-memory store, which
 * makes it atomic by construction: the destination gets a fresh record
 * (new queue-scoped id, `transferredAt` stamped, `origin` preserved)
 * and the source record is marked `transferred` — never deleted, so
 * the audit trail shows both ends.
 *
 * Only `pending` and `quarantined` records move: replaying a record
 * mid-claim would race its settler; replayed/transferred records are
 * already settled history.
 *
 * @module DeadLetterLayer/Engine2
 */

import { DlqClock2, SystemDlqClock2, TransferResult } from './types';
import { RecordStore } from './RecordStore';
import { signatureOf } from './ErrorClusters';
import { QuarantineRegistry } from './Quarantine';

export class TransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferError';
  }
}

export class CrossTransfer {
  private readonly _store: RecordStore;
  private readonly _clock: DlqClock2;

  constructor(store: RecordStore, clock: DlqClock2 = new SystemDlqClock2()) {
    this._store = store;
    this._clock = clock;
  }

  /** Move one record to `to`. Quarantined records stay quarantined at the destination. */
  move(recordId: string, to: string, quarantine?: QuarantineRegistry): TransferResult {
    const rec = this._store.get(recordId);
    if (!rec) throw new TransferError(`unknown record '${recordId}'`);
    if (rec.state !== 'pending' && rec.state !== 'quarantined') {
      throw new TransferError(
        `cannot transfer '${recordId}' from state '${rec.state}'`
      );
    }
    const wasQuarantined = rec.state === 'quarantined';
    const newId = this._store.add(to, {
      origin: rec.origin,
      enqueuedAt: rec.enqueuedAt,
      failedAt: rec.failedAt,
      attempts: rec.attempts,
      errorClass: rec.errorClass,
      errorMessage: rec.errorMessage,
      errorSite: rec.errorSite,
      headers: rec.headers,
      payload: rec.payload,
    });
    this._store.markTransferred(recordId);
    if (wasQuarantined) {
      // Park the destination copy; park() also quarantines in the store.
      quarantine?.park(newId, 'transferred while quarantined');
      if (!quarantine) this._store.quarantine(newId);
    }
    return {
      recordId,
      from: rec.queue,
      to,
      newId,
      transferredAt: this._clock.now(),
    };
  }

  /** Move every pending record on `from` matching a signature. */
  moveBySignature(
    from: string,
    to: string,
    signature: string,
    quarantine?: QuarantineRegistry
  ): TransferResult[] {
    const out: TransferResult[] = [];
    for (const rec of this._store.list(from, 'pending')) {
      if (signatureOf(rec) === signature) {
        out.push(this.move(rec.id, to, quarantine));
      }
    }
    return out;
  }

  /** Move every pending record on `from`. Returns in FIFO order. */
  moveAll(from: string, to: string, quarantine?: QuarantineRegistry): TransferResult[] {
    const out: TransferResult[] = [];
    for (const rec of this._store.list(from, 'pending')) {
      out.push(this.move(rec.id, to, quarantine));
    }
    return out;
  }
}
