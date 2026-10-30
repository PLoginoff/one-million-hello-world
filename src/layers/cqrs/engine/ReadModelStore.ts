/**
 * ReadModelStore — the queryable side of CQRS.
 *
 * One store hosts several named read models ("orders-by-customer",
 * "inventory-view"...). Each read model is a document collection keyed by
 * id. On top of raw documents the store tracks **per-projection
 * checkpoints**: the global event position each projection has applied.
 * Checkpoints are what make resume-after-restart and incremental rebuilds
 * possible — they're the read side's equivalent of a Kafka consumer offset.
 *
 * Design:
 *   - documents: Map<modelName, Map<id, doc>> — O(1) point reads.
 *   - secondary indexes: optional per-model index on a scalar field
 *     (e.g. `customerId`) → set of ids. Rebuilt incrementally on write;
 *     `findBy(model, field, value)` is O(1) instead of a full scan.
 *   - checkpoints: Map<projectionName, position> — updated by
 *     `applyBatch(projection, position, ops)`, which is the atomic unit:
 *     document writes + checkpoint move together (a crash between them
 *     would re-deliver events — projections must be idempotent anyway).
 *   - version guard: ops may carry `expectedVersion` (optimistic
 *     concurrency on read models, rare but useful when two writers race
 *     during a rebuild).
 *
 * @module CqrsLayer/Engine
 */

import { ProjectionOp } from '../implementations/Denormalizer';

export type ReadModelDocument = Record<string, unknown>;

export interface ReadModelDef {
  readonly name: string;
  /** Scalar fields to maintain a secondary index on (findBy lookups). */
  readonly indexes?: readonly string[];
}

interface ModelState {
  readonly def: ReadModelDef;
  readonly docs: Map<string, ReadModelDocument>;
  /** field -> value -> set of doc ids. */
  readonly indexes: Map<string, Map<unknown, Set<string>>>;
}

export class ReadModelError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ReadModelError';
  }
}

export class ReadModelStore {
  private readonly _models = new Map<string, ModelState>();
  /** projection name -> last applied global position. */
  private readonly _checkpoints = new Map<string, number>();

  /** Declare a read model (idempotent — redeclaring keeps the data). */
  registerModel(def: ReadModelDef): void {
    if (this._models.has(def.name)) return;
    const indexes = new Map<string, Map<unknown, Set<string>>>();
    for (const field of def.indexes ?? []) indexes.set(field, new Map());
    this._models.set(def.name, { def, docs: new Map(), indexes });
  }

  private _model(name: string): ModelState {
    const m = this._models.get(name);
    if (!m) throw new ReadModelError(`unknown read model '${name}'`);
    return m;
  }

  // ------------------------------------------------------------- writing

  /**
   * Apply a batch of ops for a projection and advance its checkpoint.
   * Atomic within the call: all ops apply, then the checkpoint moves.
   */
  applyBatch(projection: string, position: number, model: string, ops: ProjectionOp[]): void {
    const m = this._model(model);
    for (const op of ops) this._applyOp(m, op);
    const cur = this._checkpoints.get(projection) ?? -1;
    if (position > cur) this._checkpoints.set(projection, position);
  }

  /** Single write without checkpoint (manual fixes, seeds). */
  upsert(model: string, id: string, doc: ReadModelDocument): void {
    this._applyOp(this._model(model), { kind: 'upsert', id, document: doc });
  }

  delete(model: string, id: string): boolean {
    const m = this._model(model);
    return this._removeDoc(m, id);
  }

  private _applyOp(m: ModelState, op: ProjectionOp): void {
    switch (op.kind) {
      case 'upsert': {
        const existing = m.docs.get(op.id);
        this._checkVersion(existing, op.expectedVersion);
        if (existing) this._unindex(m, op.id, existing);
        m.docs.set(op.id, { ...op.document });
        this._index(m, op.id, op.document);
        break;
      }
      case 'patch': {
        const existing = m.docs.get(op.id);
        this._checkVersion(existing, op.expectedVersion);
        const merged = { ...(existing ?? {}), ...op.patch };
        if (existing) this._unindex(m, op.id, existing);
        m.docs.set(op.id, merged);
        this._index(m, op.id, merged);
        break;
      }
      case 'delete': {
        const existing = m.docs.get(op.id);
        this._checkVersion(existing, op.expectedVersion);
        this._removeDoc(m, op.id);
        break;
      }
    }
  }

  private _checkVersion(existing: ReadModelDocument | undefined, expected?: number): void {
    if (expected === undefined) return;
    const cur = (existing?.__v as number | undefined) ?? 0;
    if (cur !== expected) {
      throw new ReadModelError(`version conflict: expected ${expected}, found ${cur}`);
    }
  }

  private _removeDoc(m: ModelState, id: string): boolean {
    const existing = m.docs.get(id);
    if (!existing) return false;
    this._unindex(m, id, existing);
    return m.docs.delete(id);
  }

  private _index(m: ModelState, id: string, doc: ReadModelDocument): void {
    for (const [field, idx] of m.indexes) {
      const value = doc[field];
      let bucket = idx.get(value);
      if (!bucket) {
        bucket = new Set();
        idx.set(value, bucket);
      }
      bucket.add(id);
    }
  }

  private _unindex(m: ModelState, id: string, doc: ReadModelDocument): void {
    for (const [field, idx] of m.indexes) {
      const bucket = idx.get(doc[field]);
      if (bucket) {
        bucket.delete(id);
        if (bucket.size === 0) idx.delete(doc[field]);
      }
    }
  }

  // ------------------------------------------------------------- reading

  get(model: string, id: string): ReadModelDocument | undefined {
    return this._models.get(model)?.docs.get(id);
  }

  /** O(1) lookup via secondary index; throws if the field isn't indexed. */
  findBy(model: string, field: string, value: unknown): ReadModelDocument[] {
    const m = this._model(model);
    const idx = m.indexes.get(field);
    if (!idx) {
      throw new ReadModelError(`no index on '${field}' for model '${model}'`);
    }
    const ids = idx.get(value);
    if (!ids) return [];
    const out: ReadModelDocument[] = [];
    for (const id of ids) {
      const doc = m.docs.get(id);
      if (doc) out.push(doc);
    }
    return out;
  }

  /** Full scan — O(n); fine for admin screens, avoid on hot paths. */
  all(model: string): ReadModelDocument[] {
    return [...(this._models.get(model)?.docs.values() ?? [])];
  }

  count(model: string): number {
    return this._models.get(model)?.docs.size ?? 0;
  }

  modelNames(): string[] {
    return [...this._models.keys()];
  }

  clear(model: string): void {
    const m = this._model(model);
    m.docs.clear();
    for (const idx of m.indexes.values()) idx.clear();
  }

  // --------------------------------------------------------- checkpoints

  /** Last applied position for a projection; -1 if never ran. */
  checkpoint(projection: string): number {
    return this._checkpoints.get(projection) ?? -1;
  }

  /** Set a checkpoint directly (rebuild seeds, manual rewind). */
  setCheckpoint(projection: string, position: number): void {
    this._checkpoints.set(projection, position);
  }

  /** All checkpoints — the data a lag monitor or rebuild planner needs. */
  checkpoints(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this._checkpoints) out[k] = v;
    return out;
  }

  /** Reset a projection's checkpoint (forces replay from scratch). */
  resetCheckpoint(projection: string): void {
    this._checkpoints.delete(projection);
  }

  /**
   * Drop the checkpoint AND clear its target model — the standard prelude
   * to a full projection rebuild.
   */
  prepareRebuild(projection: string, model: string): void {
    this.resetCheckpoint(projection);
    this.clear(model);
  }
}
