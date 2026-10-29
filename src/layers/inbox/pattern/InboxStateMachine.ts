/**
 * InboxStateMachine — legal transitions and pure transition helpers.
 *
 *   RECEIVED  -> PROCESSING | DEFERRED | PARKED(admin)
 *   DEFERRED  -> RECEIVED (predecessor cleared) | PARKED(admin)
 *   PROCESSING-> PROCESSED | FAILED | PARKED | RECEIVED(lease expiry)
 *   FAILED    -> PROCESSING (retry due) | PARKED (max attempts)
 *   PROCESSED -> (terminal until retention cleanup)
 *   PARKED    -> RECEIVED (manual re-drive) | (terminal otherwise)
 *
 * All mutating helpers stamp the record's timestamps; the machine keeps
 * every transition explicit so illegal moves throw rather than silently
 * corrupt state.
 *
 * @module Inbox/Pattern
 */

import { InboxState, InboxRecord, InboxPatternError, InboxPatternErrorCode } from './types';

const LEGAL: ReadonlyMap<InboxState, ReadonlySet<InboxState>> = new Map([
  [InboxState.RECEIVED, new Set([InboxState.PROCESSING, InboxState.DEFERRED, InboxState.PARKED])],
  [InboxState.DEFERRED, new Set([InboxState.RECEIVED, InboxState.PARKED])],
  [InboxState.PROCESSING, new Set([InboxState.PROCESSED, InboxState.FAILED, InboxState.PARKED, InboxState.RECEIVED])],
  [InboxState.FAILED, new Set([InboxState.PROCESSING, InboxState.PARKED])],
  [InboxState.PROCESSED, new Set()],
  [InboxState.PARKED, new Set([InboxState.RECEIVED])],
]);

export class InboxStateMachine {
  static canTransition(from: InboxState, to: InboxState): boolean {
    return LEGAL.get(from)?.has(to) ?? false;
  }

  static assert(from: InboxState, to: InboxState, recordId: string): void {
    if (!InboxStateMachine.canTransition(from, to)) {
      throw new InboxPatternError(
        InboxPatternErrorCode.ILLEGAL_TRANSITION,
        `illegal inbox transition ${from} -> ${to} for record ${recordId}`
      );
    }
  }

  /** RECEIVED|DEFERRED -> PROCESSING: take the lease. */
  static acquire(record: InboxRecord, now: number, leaseMs: number): void {
    InboxStateMachine.assert(record.state, InboxState.PROCESSING, record.id);
    record.state = InboxState.PROCESSING;
    record.attempts++;
    record.leaseUntil = now + leaseMs;
  }

  /** PROCESSING -> PROCESSED. */
  static complete(record: InboxRecord, now: number): void {
    InboxStateMachine.assert(record.state, InboxState.PROCESSED, record.id);
    record.state = InboxState.PROCESSED;
    record.processedAt = now;
    record.leaseUntil = undefined;
    record.nextAttemptAt = undefined;
  }

  /** PROCESSING -> FAILED with next-attempt schedule. */
  static fail(record: InboxRecord, error: string, nextAttemptAt: number): void {
    InboxStateMachine.assert(record.state, InboxState.FAILED, record.id);
    record.state = InboxState.FAILED;
    record.lastError = error;
    record.nextAttemptAt = nextAttemptAt;
    record.leaseUntil = undefined;
  }

  /** PROCESSING|FAILED|RECEIVED|DEFERRED -> PARKED. */
  static park(record: InboxRecord, reason: string, now: number): void {
    InboxStateMachine.assert(record.state, InboxState.PARKED, record.id);
    record.state = InboxState.PARKED;
    record.parkedReason = reason;
    record.processedAt = now;
    record.leaseUntil = undefined;
    record.nextAttemptAt = undefined;
  }

  /** * -> RECEIVED: re-drive a parked record, or release an expired lease. */
  static release(record: InboxRecord): void {
    InboxStateMachine.assert(record.state, InboxState.RECEIVED, record.id);
    record.state = InboxState.RECEIVED;
    record.leaseUntil = undefined;
    record.nextAttemptAt = undefined;
  }

  /** RECEIVED -> DEFERRED (waiting on predecessor). */
  static defer(record: InboxRecord): void {
    InboxStateMachine.assert(record.state, InboxState.DEFERRED, record.id);
    record.state = InboxState.DEFERRED;
  }

  /** DEFERRED -> RECEIVED (predecessor resolved). */
  static undefer(record: InboxRecord): void {
    InboxStateMachine.assert(record.state, InboxState.RECEIVED, record.id);
    record.state = InboxState.RECEIVED;
  }

  /** Is a record's lease expired (crashed consumer recovery)? */
  static leaseExpired(record: InboxRecord, now: number): boolean {
    return record.state === InboxState.PROCESSING && record.leaseUntil !== undefined && now >= record.leaseUntil;
  }

  /** Is a FAILED record due for retry? */
  static retryDue(record: InboxRecord, now: number): boolean {
    return record.state === InboxState.FAILED && record.nextAttemptAt !== undefined && now >= record.nextAttemptAt;
  }
}
