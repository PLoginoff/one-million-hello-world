/**
 * Transaction Script Runner
 *
 * Unit-of-work pattern per operation: each service operation gets a
 * fresh `UnitOfWork`, the operation body runs inside it, and the engine
 * commits on success / rolls back on any throw. Guarantees atomicity
 * even when operations span multiple storage calls.
 *
 * The included `StagedUnitOfWork` is a concrete in-memory UoW: writes
 * land in a staging buffer and commit atomically by mutating the
 * backing store at commit-time only. Rollback drops the buffer, leaving
 * the store untouched — cheap snapshot isolation.
 *
 * @module ServiceLayer/Engine
 */

import { UnitOfWork, UnitOfWorkFactory } from './types';

/** Clock abstraction — injectable. */
export interface Clock {
  now(): number;
}

/** System wall clock. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** Manual clock for tests. */
export class ManualClock implements Clock {
  private _current: number;
  constructor(start = 0) {
    this._current = start;
  }
  now(): number {
    return this._current;
  }
  advance(ms: number): void {
    this._current += ms;
  }
}

/** Raised when the UoW body or commit/rollback itself fails. */
export class TransactionError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TransactionError';
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Staged in-memory unit of work
// ---------------------------------------------------------------------------

/**
 * Record-store abstraction the staging UoW commits into.
 *
 * The store is a `Map<string, Record<string, unknown>>` — flat rows
 * keyed by id. Staging happens against a per-UoW copy; commit applies
 * all staged changes (set + delete) to the store in one shot.
 */
export class InMemoryRecordStore {
  private readonly _rows: Map<string, Record<string, unknown>>;

  constructor(seed?: Map<string, Record<string, unknown>>) {
    this._rows = seed !== undefined ? new Map(seed) : new Map();
  }

  get rows(): ReadonlyMap<string, Record<string, unknown>> {
    return this._rows;
  }

  /** Commit-time mutation — engine-internal. */
  applySet(id: string, row: Record<string, unknown>): void {
    this._rows.set(id, row);
  }

  /** Commit-time mutation — engine-internal. */
  applyDelete(id: string): void {
    this._rows.delete(id);
  }
}

/**
 * Unit of work that buffers writes (set/delete) and applies them
 * atomically on `commit()`. Reads check staging first (read-your-writes).
 */
export class StagedUnitOfWork implements UnitOfWork {
  private readonly _store: InMemoryRecordStore;
  private readonly _staged: Map<string, Record<string, unknown>>;
  private readonly _deletes: Set<string>;
  private _finished: boolean;

  constructor(store: InMemoryRecordStore) {
    this._store = store;
    this._staged = new Map();
    this._deletes = new Set();
    this._finished = false;
  }

  /**
   * Read — checks staged writes, then falls through to the store.
   * Tombstoned ids (staged deletes) return `undefined`.
   */
  get<T extends Record<string, unknown>>(id: string): T | undefined {
    this._assertOpen();
    if (this._deletes.has(id)) {
      return undefined;
    }
    const staged = this._staged.get(id);
    if (staged !== undefined) {
      return staged as T;
    }
    return this._store.rows.get(id) as T | undefined;
  }

  /** Stage a write (upsert). */
  set<T extends Record<string, unknown>>(id: string, row: T): void {
    this._assertOpen();
    this._staged.set(id, row);
    this._deletes.delete(id);
  }

  /** Stage a delete. */
  remove(id: string): void {
    this._assertOpen();
    this._staged.delete(id);
    this._deletes.add(id);
  }

  /** Execute the operation body inside the unit's staging context. */
  async execute<T>(operation: (uow: StagedUnitOfWork) => Promise<T>): Promise<T> {
    this._assertOpen();
    return operation(this);
  }

  /** Apply all staged changes atomically. Idempotent. */
  async commit(): Promise<void> {
    this._assertOpen();
    // Apply deletes before sets so a staged set of a deleted id lands.
    for (const id of this._deletes) {
      this._store.applyDelete(id);
    }
    for (const [id, row] of this._staged) {
      this._store.applySet(id, row);
    }
    this._finished = true;
  }

  /** Discard staged changes. Idempotent. */
  async rollback(): Promise<void> {
    this._assertOpen();
    this._staged.clear();
    this._deletes.clear();
    this._finished = true;
  }

  /** Whether this unit has finished (committed or rolled back). */
  get finished(): boolean {
    return this._finished;
  }

  private _assertOpen(): void {
    if (this._finished) {
      throw new TransactionError('Unit of work already finished');
    }
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/** Report for one operation run. */
export interface TransactionReport<T> {
  readonly outcome: T;
  readonly committed: boolean;
  readonly durationMs: number;
}

/**
 * Transaction script runner — wraps every operation in a fresh UoW,
 * commits on success, rolls back on failure, and reports timing.
 */
export class TransactionScriptRunner {
  private readonly _uowFactory: UnitOfWorkFactory;
  private readonly _clock: Clock;
  private _runs: number;
  private _committedRuns: number;
  private _rolledBackRuns: number;

  constructor(uowFactory: UnitOfWorkFactory, clock: Clock = new SystemClock()) {
    this._uowFactory = uowFactory;
    this._clock = clock;
    this._runs = 0;
    this._committedRuns = 0;
    this._rolledBackRuns = 0;
  }

  /** Counters. */
  get runs(): number {
    return this._runs;
  }
  get committed(): number {
    return this._committedRuns;
  }
  get rolledBack(): number {
    return this._rolledBackRuns;
  }

  /**
   * Execute an operation inside a fresh unit of work.
   *
   * Contract: `body` receives the UoW; if `body` throws (or its
   * promise rejects) the UoW is rolled back and the error propagates.
   * On success the UoW commits and the body's return is the outcome.
   * Commit/rollback failures surface as {@link TransactionError}.
   */
  async run<T>(body: (uow: UnitOfWork) => Promise<T>): Promise<TransactionReport<T>> {
    const uow = this._uowFactory();
    this._runs++;
    const start = this._clock.now();

    let outcome: T;
    try {
      outcome = await uow.execute(() => body(uow));
    } catch (error) {
      try {
        await uow.rollback();
      } catch (rollbackError) {
        this._rolledBackRuns++;
        throw new TransactionError('Rollback failed after operation error', rollbackError);
      }
      this._rolledBackRuns++;
      throw error;
    }

    try {
      await uow.commit();
    } catch (commitError) {
      this._rolledBackRuns++;
      try {
        await uow.rollback();
      } catch {
        // Double failure — report the original commit failure.
      }
      throw new TransactionError('Commit failed', commitError);
    }
    this._committedRuns++;

    return {
      outcome,
      committed: true,
      durationMs: this._clock.now() - start,
    };
  }

  /**
   * Convenience runner for a {@link StagedUnitOfWork} against a shared
   * record store.
   */
  static forStore(store: InMemoryRecordStore, clock?: Clock): TransactionScriptRunner {
    return new TransactionScriptRunner(() => new StagedUnitOfWork(store), clock);
  }
}
