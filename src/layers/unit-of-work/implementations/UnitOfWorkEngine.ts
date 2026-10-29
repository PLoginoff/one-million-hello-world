/**
 * UnitOfWorkEngine — transactional boundary around a set of entity writes.
 *
 * Coordinates the full commit lifecycle:
 *   1. Compute the change set (EntityTracker + snapshot diff).
 *   2. Order writes by dependency graph (inserts topological, deletes reversed).
 *   3. Optimistic concurrency: for each MODIFIED/REMOVED entity, compare
 *      `entity.version` to `attachedVersion` — a mismatch means a stale write.
 *   4. Apply writes through the pluggable `EntityPersister`.
 *   5. acceptAllChanges: refresh snapshots, mark clean.
 *
 * Failure semantics:
 *   - Persisters write to an in-memory journal; on error the engine rolls
 *     back all writes it made (via `restore`) and re-throws.
 *   - Nested units of work use savepoints — a nested rollback only undoes
 *     writes since the savepoint.
 *   - Idempotent commit: a second commit() after a successful first is a
 *     no-op returning the cached result.
 *
 * @module UnitOfWorkLayer/Implementations
 */

import {
  ChangeSet,
  EntityState,
  EntityTracker,
  TrackableEntity,
  TrackedEntry,
  deepClone,
} from './EntityTracker';
import { DependencyGraph } from './CommitOrdering';

// ------------------------------------------------------------------ types

/** Per-entity write operation emitted by the engine. */
export interface WriteOp<T extends TrackableEntity = TrackableEntity> {
  readonly kind: 'insert' | 'update' | 'delete';
  readonly entityType: string;
  readonly entityId: string;
  readonly entity: T;
  /** Fields changed (update only). */
  readonly changedFields?: string[];
  /** Version the entity is expected to be at — optimistic lock check. */
  readonly expectedVersion?: number;
}

/**
 * Storage abstraction — the unit of work is agnostic about the backend.
 * `apply` performs a single write and returns the prior state of the
 * entity (undefined for inserts into empty slots), which the engine
 * journals for rollback. `restore` undoes a write using that prior state.
 */
export interface EntityPersister {
  apply(op: WriteOp): Promise<TrackableEntity | undefined> | TrackableEntity | undefined;
  /** Undo a previously applied write — used for rollback. */
  restore(op: WriteOp, priorState: TrackableEntity | undefined): Promise<void> | void;
}

/** Optimistic concurrency violation. */
export class OptimisticLockError extends Error {
  readonly entityType: string;
  readonly entityId: string;
  readonly expected: number;
  readonly actual: number;
  constructor(entityType: string, entityId: string, expected: number, actual: number) {
    super(
      `Optimistic lock violation on '${entityType}:${entityId}': expected version ${expected}, actual ${actual}`,
    );
    this.name = 'OptimisticLockError';
    this.entityType = entityType;
    this.entityId = entityId;
    this.expected = expected;
    this.actual = actual;
  }
}

/** Commit outcome. */
export interface CommitResult {
  /** Whether any writes were issued. */
  readonly hadChanges: boolean;
  /** Applied ops in dependency order. */
  readonly ops: WriteOp[];
  /** Monotonic commit id for idempotency + journaling. */
  readonly commitId: string;
  readonly elapsedMs: number;
  /** Parent savepoint id when nested. */
  readonly savepoint?: string;
}

/** A savepoint marker for nested units of work. */
export interface Savepoint {
  readonly id: string;
  /** Index into the applied-ops journal when the savepoint was taken. */
  readonly journalIndex: number;
  /** Snapshot of tracker entry states at savepoint time. */
  readonly trackedStates: Map<string, { state: EntityState; snapshot: Record<string, unknown>; entity: TrackableEntity }>;
}

// ------------------------------------------------------------------ engine

let _commitCounter = 0;
function nextCommitId(): string {
  _commitCounter += 1;
  return `commit-${Date.now().toString(36)}-${_commitCounter}`;
}
let _savepointCounter = 0;
function nextSavepointId(): string {
  _savepointCounter += 1;
  return `sp-${_savepointCounter}`;
}

export class UnitOfWorkEngine<T extends TrackableEntity = TrackableEntity> {
  readonly tracker: EntityTracker<T>;
  private readonly _persister: EntityPersister;
  private readonly _deps: DependencyGraph;
  /** Journal of applied ops (for rollback). */
  private readonly _journal: WriteOp[] = [];
  /** Prior states per journal op (parallel to _journal). */
  private readonly _priorStates: (TrackableEntity | undefined)[] = [];
  /** Savepoint stack — innermost last. */
  private readonly _savepoints: Savepoint[] = [];
  /** Cached result for idempotent commit. */
  private _committedResult: CommitResult | undefined;
  private _rolledBack = false;
  private _versionFetcher?: (entityType: string, id: string) => number | undefined;

  constructor(
    persister: EntityPersister,
    options: {
      deps?: DependencyGraph;
      /** Optional live version lookup — when provided, optimistic checks
       *  compare against the store's version rather than attachedVersion. */
      versionFetcher?: (entityType: string, id: string) => number | undefined;
    } = {},
  ) {
    this.tracker = new EntityTracker<T>();
    this._persister = persister;
    this._deps = options.deps ?? new DependencyGraph();
    this._versionFetcher = options.versionFetcher;
  }

  /** True after a successful commit. */
  get committed(): boolean {
    return this._committedResult !== undefined;
  }

  /** True after rollback. */
  get rolledBack(): boolean {
    return this._rolledBack;
  }

  /**
   * Commit pending changes. Idempotent — a second call returns the
   * cached result without re-applying writes.
   */
  async commit(): Promise<CommitResult> {
    if (this._committedResult) return this._committedResult;
    if (this._rolledBack) {
      throw new Error('Cannot commit a rolled-back unit of work');
    }
    const start = Date.now();

    const cs = this.tracker.changeSet();
    if (cs.added.length === 0 && cs.modified.length === 0 && cs.removed.length === 0) {
      const result: CommitResult = {
        hadChanges: false,
        ops: [],
        commitId: nextCommitId(),
        elapsedMs: Date.now() - start,
        savepoint: this._savepoints[this._savepoints.length - 1]?.id,
      };
      this._committedResult = result;
      return result;
    }

    const ops = this._planOps(cs);
    const appliedCount = this._journal.length;
    try {
      for (const op of ops) {
        // Optimistic concurrency check BEFORE applying.
        this._checkOptimistic(op);
        const prior = await this._persister.apply(op);
        this._journal.push(op);
        this._priorStates.push(prior);
      }
      this.tracker.acceptAllChanges();
    } catch (e) {
      // Roll back only the ops applied by THIS commit attempt.
      await this._rollbackTo(appliedCount);
      throw e;
    }

    const result: CommitResult = {
      hadChanges: true,
      ops,
      commitId: nextCommitId(),
      elapsedMs: Date.now() - start,
      savepoint: this._savepoints[this._savepoints.length - 1]?.id,
    };
    this._committedResult = result;
    return result;
  }

  /**
   * Roll back all writes applied since the outermost savepoint (or all,
   * if none). Tracker state is restored to the savepoint snapshot.
   */
  async rollback(): Promise<void> {
    const toIndex = this._savepoints.length > 0 ? this._savepoints[0]!.journalIndex : 0;
    await this._rollbackTo(toIndex);
    this._rolledBack = true;
    this._savepoints.length = 0;
    if (toIndex === 0) this.tracker.clear();
  }

  /**
   * Begin a nested scope — writes after this point can be rolled back
   * without losing earlier work (savepoint semantics).
   */
  beginNested(): Savepoint {
    const trackedStates = new Map<string, { state: EntityState; snapshot: Record<string, unknown>; entity: TrackableEntity }>();
    for (const e of this.tracker.entries()) {
      trackedStates.set(`${e.entityType}:${e.id}`, {
        state: e.state,
        snapshot: e.snapshot,
        entity: deepClone(e.entity) as TrackableEntity,
      });
    }
    const sp: Savepoint = {
      id: nextSavepointId(),
      journalIndex: this._journal.length,
      trackedStates,
    };
    this._savepoints.push(sp);
    return sp;
  }

  /**
   * Roll back to a specific savepoint — undoes writes after it and
   * restores tracker state. Savepoints above it are discarded.
   */
  async rollbackToSavepoint(savepointId: string): Promise<void> {
    const idx = this._savepoints.findIndex((s) => s.id === savepointId);
    if (idx < 0) throw new Error(`Unknown savepoint '${savepointId}'`);
    const sp = this._savepoints[idx]!;
    await this._rollbackTo(sp.journalIndex);
    // Restore tracker snapshots. Entities tracked now but absent from
    // the savepoint snapshot were attached AFTER the savepoint — they
    // are detached (the savepoint never knew about them).
    for (const entry of [...this.tracker.entries()]) {
      const key = `${entry.entityType}:${entry.id}`;
      const saved = sp.trackedStates.get(key);
      if (saved) {
        entry.state = saved.state;
        entry.snapshot = deepClone(saved.snapshot);
        // Restore entity field values too.
        Object.assign(
          entry.entity as unknown as Record<string, unknown>,
          deepClone(saved.entity) as unknown as Record<string, unknown>,
        );
      } else {
        this.tracker.detach(entry.entityType, entry.id);
      }
    }
    this._savepoints.length = idx; // pop this and all later savepoints
  }

  /** Release a savepoint without rolling back — keeps writes. */
  releaseSavepoint(savepointId: string): void {
    const idx = this._savepoints.findIndex((s) => s.id === savepointId);
    if (idx < 0) throw new Error(`Unknown savepoint '${savepointId}'`);
    this._savepoints.splice(idx, 1);
  }

  /** Read the applied-ops journal (diagnostics). */
  journal(): readonly WriteOp[] {
    return this._journal;
  }

  // ------------------------------------------------------------- internals

  /**
   * Plan writes in dependency order:
   *   inserts sorted topologically (parents first)
   *   deletes sorted reverse-topologically (children first)
   *   updates sorted topologically (deterministic)
   * Final order: inserts → updates → deletes.
   */
  private _planOps(cs: ChangeSet<T>): WriteOp[] {
    const allTypes = new Set<string>();
    for (const e of [...cs.added, ...cs.modified, ...cs.removed]) allTypes.add(e.entityType);
    const insertOrder = this._deps.order(allTypes);
    const deleteOrder = [...insertOrder].reverse();
    const rankOf = (order: string[]) => {
      const m = new Map<string, number>();
      order.forEach((t, i) => m.set(t, i));
      return (e: TrackedEntry<T>) => m.get(e.entityType) ?? 0;
    };

    const insertRank = rankOf(insertOrder);
    const deleteRank = rankOf(deleteOrder);

    const inserts: WriteOp[] = cs.added
      .slice()
      .sort((a, b) => insertRank(a) - insertRank(b))
      .map((e) => ({ kind: 'insert', entityType: e.entityType, entityId: e.id, entity: e.entity }));

    const updates: WriteOp[] = cs.modified
      .slice()
      .sort((a, b) => insertRank(a) - insertRank(b))
      .map((e) => ({
        kind: 'update',
        entityType: e.entityType,
        entityId: e.id,
        entity: e.entity,
        changedFields: cs.changedFields.get(e),
        expectedVersion: e.attachedVersion,
      }));

    const deletes: WriteOp[] = cs.removed
      .slice()
      .sort((a, b) => deleteRank(a) - deleteRank(b))
      .map((e) => ({
        kind: 'delete',
        entityType: e.entityType,
        entityId: e.id,
        entity: e.entity,
        expectedVersion: e.attachedVersion,
      }));

    return [...inserts, ...updates, ...deletes];
  }

  private _checkOptimistic(op: WriteOp): void {
    if (op.expectedVersion === undefined) return;
    const actual = this._versionFetcher?.(op.entityType, op.entityId);
    if (actual !== undefined && actual !== op.expectedVersion) {
      throw new OptimisticLockError(op.entityType, op.entityId, op.expectedVersion, actual);
    }
  }

  /**
   * Undo journal entries from `toIndex` forward — LIFO order so later
   * writes are undone first.
   */
  private async _rollbackTo(toIndex: number): Promise<void> {
    while (this._journal.length > toIndex) {
      const op = this._journal.pop()!;
      const prior = this._priorStates.pop();
      await this._persister.restore(op, prior);
    }
  }
}
