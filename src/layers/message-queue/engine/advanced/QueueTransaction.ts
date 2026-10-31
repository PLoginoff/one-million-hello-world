/**
 * QueueTransaction — two-phase commit for multi-queue atomic sends.
 *
 * A transaction that touches ONE queue is easy (enqueue in a critical
 * section). The hard case is atomically sending to SEVERAL queues — the
 * "send order-confirmation AND audit-log AND metrics" pattern — without a
 * partial commit if the second queue is full.
 *
 * Two-phase commit (2PC):
 *
 *   Phase 1 — stage: `send` buffers operations; nothing is visible.
 *             `prepare` validates every staged send against each queue's
 *             capacity (the "can we commit?" vote). Any NO → abort.
 *
 *   Phase 2 — commit: all votes YES → apply every send. Since prepares
 *             passed, commit can't fail on capacity — the atomicity
 *             guarantee. (A commit CAN still fail on a queue that threw
 *             for a non-capacity reason; we surface it via the coordinator.)
 *
 *   Abort: drop the staged buffer — nothing was ever applied.
 *
 * Why 2PC and not just "try all sends and roll back": a broker can't
 * un-deliver a message a consumer already took. Staging means sends
 * become visible only at commit — the prepare phase exists precisely
 * because visibility-then-rollback is impossible.
 *
 * The coordinator (`begin`/`prepare`/`commit`) is the transaction manager;
 * queues are resource managers that must answer "can you accept this send?"
 * without actually doing it.
 *
 * @module MessageQueueLayer/Engine/Advanced
 */

import { PrepareFailedError, StagedSend, TransactionStateError, TxState } from './types';

/** Resource-manager interface a queue must satisfy to join a transaction. */
export interface TxQueue {
  readonly name: string;
  /** Can this queue accept `sends` right now? (prepare vote — no side effects) */
  canAccept(sends: readonly StagedSend[]): { ok: boolean; reason?: string };
  /** Apply the staged sends (commit — only called after all votes YES). */
  apply(sends: readonly StagedSend[]): void;
}

let txSeq = 0;

export class QueueTransaction<T = unknown> {
  readonly id: string;
  private _state: TxState = 'open';
  private readonly staged = new Map<string, StagedSend<T>[]>();

  constructor(private readonly idGen: () => string = () => `tx-${++txSeq}`) {
    this.id = this.idGen();
  }

  get state(): TxState {
    return this._state;
  }

  /** Buffers a send; nothing visible until commit. */
  send(queue: string, payload: T, options: Partial<Omit<StagedSend<T>, 'queue' | 'payload'>> = {}): this {
    this.assertOpen();
    const list = this.staged.get(queue) ?? [];
    list.push({
      queue,
      payload,
      priority: options.priority ?? 0,
      delayMs: options.delayMs ?? 0,
      headers: options.headers ?? {},
      ttlMs: options.ttlMs,
    });
    this.staged.set(queue, list);
    return this;
  }

  /** All staged queue names. */
  queues(): string[] {
    return [...this.staged.keys()];
  }

  /** Staged sends for one queue (what the resource manager votes on). */
  stagedFor(queue: string): readonly StagedSend<T>[] {
    return this.staged.get(queue) ?? [];
  }

  get stagedCount(): number {
    let n = 0;
    for (const l of this.staged.values()) n += l.length;
    return n;
  }

  /** Transitions to 'prepared' (the coordinator does the actual voting). */
  markPrepared(): void {
    this.assertOpen();
    this._state = 'prepared';
  }

  markCommitted(): void {
    if (this._state !== 'prepared') {
      throw new TransactionStateError(this.id, this._state);
    }
    this._state = 'committed';
    this.staged.clear();
  }

  /** Abort from any non-final state — drops the buffer. */
  abort(): void {
    if (this._state === 'committed') {
      throw new TransactionStateError(this.id, 'committed');
    }
    this._state = 'aborted';
    this.staged.clear();
  }

  private assertOpen(): void {
    if (this._state !== 'open') {
      throw new TransactionStateError(this.id, this._state);
    }
  }
}

/**
 * The transaction coordinator — runs 2PC across registered queues.
 * `begin → send* → commit`:
 *   commit → prepare votes on every touched queue → all YES → apply all.
 */
export class TransactionCoordinator {
  private readonly queues = new Map<string, TxQueue>();
  private readonly committed: string[] = [];

  /** Registers a queue as a resource manager. */
  registerQueue(q: TxQueue): void {
    this.queues.set(q.name, q);
  }

  /** Runs a full 2PC: prepares every touched queue, then commits or aborts. */
  commit<T>(tx: QueueTransaction<T>): void {
    // Phase 1: prepare — every queue votes.
    for (const name of tx.queues()) {
      const q = this.queues.get(name);
      if (!q) {
        tx.abort();
        throw new PrepareFailedError(tx.id, `queue "${name}" not registered`);
      }
      const vote = q.canAccept(tx.stagedFor(name));
      if (!vote.ok) {
        tx.abort();
        throw new PrepareFailedError(
          tx.id,
          `queue "${name}" voted NO: ${vote.reason ?? 'unspecified'}`
        );
      }
    }
    tx.markPrepared();

    // Phase 2: commit — all votes YES, apply in staged order.
    for (const name of tx.queues()) {
      const q = this.queues.get(name);
      if (q) q.apply(tx.stagedFor(name));
    }
    tx.markCommitted();
    this.committed.push(tx.id);
  }

  committedTxIds(): readonly string[] {
    return this.committed;
  }
}
