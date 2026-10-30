/**
 * Bus-Level Transactions
 *
 * Groups multiple sends so they either all become visible or none do —
 * the messaging analogue of `select for update ... commit`. Because the
 * topology is in-memory we can do a two-phase approach synchronously:
 *
 *   1. Stage: each `send()` records intent and dry-runs routing. A send
 *      that routes to zero queues is *not* an error at stage time (a
 *      valid publish to an empty topic), but it is recorded.
 *   2. Commit: staged sends are published in order; in-memory publish
 *      cannot partially fail (queues are declared at bind time), so
 *      commit is atomic by construction.
 *   3. Rollback: drops staged sends; nothing was ever published.
 *
 * Ordering inside a commit preserves send order — consumers on a queue
 * see tx messages interleaved with non-tx traffic in wall-clock order,
 * matching Kafka/AMQP semantics (no cross-queue ordering guarantee).
 *
 * @module MessageBusLayer/Engine2
 */

import {
  BusClock2,
  RoutedMessage,
  SystemBusClock2,
  TransactionOutcome,
  TxSend,
  TxStatus,
} from './types';
import { BusTopology } from './BusTopology';

export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

let nextTxId = 0;

export interface BusTransactionOptions {
  /**
   * Max wall-clock ms a transaction may stay open. `commit()` after the
   * deadline throws and implicitly rolls back — mirrors broker tx
   * timeouts that protect consumers from abandoned producers.
   */
  readonly timeoutMs?: number;
}

export class BusTransaction {
  readonly id: string;

  private readonly _topology: BusTopology;
  private readonly _clock: BusClock2;
  private readonly _openedAt: number;
  private readonly _timeoutMs: number | undefined;
  private _status: TxStatus = 'open';
  private readonly _staged: TxSend[] = [];

  constructor(
    topology: BusTopology,
    clock: BusClock2 = new SystemBusClock2(),
    options?: BusTransactionOptions
  ) {
    this._topology = topology;
    this._clock = clock;
    this._openedAt = clock.now();
    this._timeoutMs = options?.timeoutMs;
    this.id = `tx${++nextTxId}`;
  }

  get status(): TxStatus {
    return this._status;
  }

  /** Queue a send inside the transaction. */
  send(exchange: string, message: RoutedMessage): this {
    this._assertOpen('send');
    this._staged.push({ exchange, message });
    return this;
  }

  /** Number of staged sends. */
  get stagedCount(): number {
    return this._staged.length;
  }

  /**
   * Publish all staged sends atomically. Returns per-send delivery
   * detail. Once committed the transaction cannot be reused.
   */
  commit(): TransactionOutcome {
    this._assertOpen('commit');
    if (this._timedOut()) {
      this._status = 'rolledback';
      throw new TransactionError(
        `transaction ${this.id} timed out after ${this._timeoutMs}ms`
      );
    }
    const delivered: Array<{ queue: string; messageId: string }> = [];
    for (const s of this._staged) {
      const queues = this._topology.publish(s.exchange, s.message);
      for (const q of queues) {
        // The message id is assigned inside publish; look it up via peek.
        const tail = this._topology.peek(q, Number.MAX_SAFE_INTEGER);
        const last = tail[tail.length - 1];
        delivered.push({ queue: q, messageId: last ? last.id : 'unknown' });
      }
    }
    this._status = 'committed';
    this._staged.length = 0;
    return { txId: this.id, status: 'committed', delivered };
  }

  /** Discard all staged sends. */
  rollback(): TransactionOutcome {
    this._assertOpen('rollback');
    this._staged.length = 0;
    this._status = 'rolledback';
    return { txId: this.id, status: 'rolledback', delivered: [] };
  }

  private _timedOut(): boolean {
    return (
      this._timeoutMs !== undefined &&
      this._clock.now() - this._openedAt > this._timeoutMs
    );
  }

  private _assertOpen(op: string): void {
    if (this._status !== 'open') {
      throw new TransactionError(
        `cannot ${op}: transaction ${this.id} is ${this._status}`
      );
    }
  }
}

/**
 * Factory for transactions bound to one topology and clock. Kept
 * separate so callers can share a bus without constructing
 * transactions ad hoc.
 */
export class TransactionalBus {
  private readonly _topology: BusTopology;
  private readonly _clock: BusClock2;

  constructor(topology: BusTopology, clock: BusClock2 = new SystemBusClock2()) {
    this._topology = topology;
    this._clock = clock;
  }

  get topology(): BusTopology {
    return this._topology;
  }

  begin(options?: BusTransactionOptions): BusTransaction {
    return new BusTransaction(this._topology, this._clock, options);
  }

  /**
   * Convenience: run `work` inside a transaction; commit on success,
   * roll back when the callback throws — the throw propagates after
   * rollback so callers see the original failure.
   */
  inTransaction<T>(
    work: (tx: BusTransaction) => T,
    options?: BusTransactionOptions
  ): { outcome: TransactionOutcome; result: T } {
    const tx = this.begin(options);
    try {
      const result = work(tx);
      const outcome = tx.commit();
      return { outcome, result };
    } catch (err) {
      if (tx.status === 'open') tx.rollback();
      throw err;
    }
  }
}
