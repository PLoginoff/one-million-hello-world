/**
 * InMemoryPersister — EntityPersister backed by a plain Map.
 *
 * Simulates a real store closely enough to exercise the unit-of-work:
 *   - `apply` performs the write and returns the PRIOR entity state
 *     (undefined for fresh inserts) so the engine can journal it.
 *   - `restore` undoes the write using that prior state.
 *   - Versions are bumped on insert/update; deletes remove the row.
 *   - Duplicate-id inserts throw a simulated constraint violation.
 *
 * Not intended for production — it's the reference adapter + test rig.
 *
 * @module UnitOfWorkLayer/Implementations
 */

import { TrackableEntity, deepClone } from './EntityTracker';
import { EntityPersister, WriteOp } from './UnitOfWorkEngine';

/** A stored row — versioned entity data. */
export interface StoredRow<T extends TrackableEntity = TrackableEntity> {
  readonly entityType: string;
  readonly id: string;
  /** Persisted version (starts at 1 on insert). */
  readonly version: number;
  readonly data: Record<string, unknown>;
}

export class DuplicateKeyError extends Error {
  constructor(entityType: string, id: string) {
    super(`Duplicate key '${entityType}:${id}'`);
    this.name = 'DuplicateKeyError';
  }
}

export class InMemoryPersister implements EntityPersister {
  /** key = `${entityType}:${id}` */
  private readonly _rows = new Map<string, StoredRow>();
  /** Total applied ops — diagnostics. */
  private _applyCount = 0;

  get size(): number {
    return this._rows.size;
  }

  get applyCount(): number {
    return this._applyCount;
  }

  /** Fetch a stored row. */
  get<T extends TrackableEntity>(entityType: string, id: string): StoredRow<T> | undefined {
    return this._rows.get(`${entityType}:${id}`) as StoredRow<T> | undefined;
  }

  /** Current version of a row (undefined if absent) — for optimistic checks. */
  versionOf(entityType: string, id: string): number | undefined {
    return this._rows.get(`${entityType}:${id}`)?.version;
  }

  /** All rows for a type — used by tests to assert final state. */
  rowsOfType(entityType: string): StoredRow[] {
    const out: StoredRow[] = [];
    for (const row of this._rows.values()) {
      if (row.entityType === entityType) out.push(row);
    }
    return out;
  }

  /** Apply one write op; return prior state for journaling. */
  apply(op: WriteOp): TrackableEntity | undefined {
    this._applyCount += 1;
    const key = `${op.entityType}:${op.entityId}`;
    const prior = this._rows.get(key);
    const priorEntity = prior ? (deepClone({ ...prior.data, id: op.entityId, entityType: op.entityType, version: prior.version }) as TrackableEntity) : undefined;

    switch (op.kind) {
      case 'insert': {
        if (prior) throw new DuplicateKeyError(op.entityType, op.entityId);
        this._rows.set(key, {
          entityType: op.entityType,
          id: op.entityId,
          version: 1,
          data: deepClone(op.entity) as unknown as Record<string, unknown>,
        });
        return undefined;
      }
      case 'update': {
        const newVersion = (prior?.version ?? 0) + 1;
        this._rows.set(key, {
          entityType: op.entityType,
          id: op.entityId,
          version: newVersion,
          data: deepClone(op.entity) as unknown as Record<string, unknown>,
        });
        return priorEntity;
      }
      case 'delete': {
        this._rows.delete(key);
        return priorEntity;
      }
    }
  }

  /** Undo a write using the journaled prior state. */
  restore(op: WriteOp, priorState: TrackableEntity | undefined): void {
    const key = `${op.entityType}:${op.entityId}`;
    if (priorState === undefined) {
      // No prior state — the op inserted a fresh row; delete it.
      this._rows.delete(key);
      return;
    }
    // Restore the previous row verbatim.
    this._rows.set(key, {
      entityType: op.entityType,
      id: op.entityId,
      version: priorState.version,
      data: deepClone(priorState) as unknown as Record<string, unknown>,
    });
  }

  /** Reset — for tests. */
  clear(): void {
    this._rows.clear();
    this._applyCount = 0;
  }
}
