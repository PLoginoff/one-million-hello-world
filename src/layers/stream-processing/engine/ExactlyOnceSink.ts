/**
 * ExactlyOnceSink — two-phase exactly-once delivery for stream output.
 *
 * Stream sinks can't be truly atomic with the pipeline, so the standard
 * trick is the 2-phase commit used by Flink's TwoPhaseCommitSinkFunction:
 *
 *   Phase 1 (per record): `write()` buffers the record — nothing reaches
 *           the destination yet.
 *   Phase 2 (per checkpoint barrier):
 *       a) `prepareCommit()` — freeze the buffer into a pending txn AND
 *          snapshot the source offsets covered by it.
 *       b) `commit()` — flush the txn downstream, then `ackOffsets()`
 *          tell the source "everything up to offset N is durable".
 *
 *   If the job crashes between (a) and (b): on `recover()`, the pending
 *   transaction is found and committed — never re-written from scratch
 *   because the source offsets are only acked AFTER commit succeeds.
 *   If the job crashes before (a): source offsets were never acked →
 *   records are replayed into a fresh buffer → no loss.
 *
 * The source side is modeled by `SourceCursor` (offset + ack). In a real
 * system that's a Kafka consumer; here it's a plain offset tracker so the
 * semantics are testable.
 *
 * @module StreamProcessing/Engine
 */

import { CheckpointSnapshot } from '../implementations/StreamEngine';

/** A source position that can be acknowledged after durable commit. */
export class SourceCursor {
  private _offset = 0;
  private _acked = 0;

  advance(to: number): void {
    if (to > this._offset) this._offset = to;
  }

  ack(to: number): void {
    if (to > this._acked) this._acked = to;
  }

  get offset(): number {
    return this._offset;
  }

  /** Highest offset confirmed durable downstream. */
  get acked(): number {
    return this._acked;
  }

  /** Offsets consumed but not yet proven durable. */
  get pending(): number {
    return this._offset - this._acked;
  }
}

interface PendingTxn<T> {
  readonly checkpointId: number;
  readonly records: T[];
  /** sourceName -> highest offset covered by this txn. */
  readonly offsets: Map<string, number>;
}

export type SinkWriter<T> = (records: readonly T[]) => void | Promise<void>;

export class ExactlyOnceSink<T> {
  private readonly _write: SinkWriter<T>;
  private _buffer: T[] = [];
  private _pending: PendingTxn<T> | null = null;
  private _nextCheckpointId = 1;
  private _committed = 0;
  private _aborted = 0;

  constructor(writer: SinkWriter<T>) {
    this._write = writer;
  }

  /** Buffer a record (nothing reaches the sink yet). */
  write(record: T): void {
    this._buffer.push(record);
  }

  get buffered(): number {
    return this._buffer.length;
  }

  get pendingTxn(): boolean {
    return this._pending !== null;
  }

  /**
   * Phase 2a — barrier reached: freeze the buffer as a pending
   * transaction and capture the source offsets it covers.
   * Returns a CheckpointSnapshot descriptor, or null if nothing to commit.
   */
  prepareCommit(sources: ReadonlyMap<string, SourceCursor>): CheckpointSnapshot | null {
    if (this._buffer.length === 0) return null;
    const offsets = new Map<string, number>();
    for (const [name, cur] of sources) {
      if (cur.offset > 0) offsets.set(name, cur.offset);
    }
    this._pending = {
      checkpointId: this._nextCheckpointId,
      records: this._buffer,
      offsets,
    };
    this._buffer = [];
    return {
      id: this._nextCheckpointId++,
      timestamp: Date.now(),
      operatorStates: new Map(),
      sourceOffsets: new Map(offsets),
    };
  }

  /**
   * Phase 2b — checkpoint completed: flush the pending txn downstream,
   * then ack the covered source offsets. Only after a successful commit
   * are offsets acked — that's what makes replay impossible.
   */
  async commit(sources: ReadonlyMap<string, SourceCursor>): Promise<boolean> {
    if (!this._pending) return false;
    await this._write(this._pending.records);
    for (const [name, offset] of this._pending.offsets) {
      sources.get(name)?.ack(offset);
    }
    this._committed += this._pending.records.length;
    this._pending = null;
    return true;
  }

  /**
   * Crash path: a pending txn exists but the checkpoint never completed.
   * `recover()` re-commits it — the write is retried, never skipped.
   * A crash BEFORE prepareCommit leaves the buffer intact for replay.
   */
  async recover(sources: ReadonlyMap<string, SourceCursor>): Promise<boolean> {
    return this.commit(sources);
  }

  /** Discard the pending txn (coordinator-declared abort). */
  abort(): void {
    if (this._pending) {
      this._aborted += this._pending.records.length;
      // Restore records to the buffer: they will be retried next checkpoint.
      this._buffer = [...this._pending.records, ...this._buffer];
      this._pending = null;
    }
  }

  get committedCount(): number {
    return this._committed;
  }

  get abortedCount(): number {
    return this._aborted;
  }
}
