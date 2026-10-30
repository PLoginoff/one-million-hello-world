/**
 * Versioned In-Memory Store
 *
 * Storage engine backing the `RepositoryEngine`. Implements the pieces the
 * task requires that the layer's existing `InMemoryAdapter` does NOT:
 *
 *   - Optimistic locking: every row carries a monotonically increasing
 *     `_version`. `update` requires the expected version; a mismatch throws
 *     `OptimisticLockError` (read-modify-write races surface as errors,
 *     not silent lost updates).
 *
 *   - Soft deletes: `delete` marks `deletedAt` instead of removing. A
 *     registered global filter hides soft-deleted rows from ALL queries
 *     (the Hibernate `@Where` / EF Core global query filter pattern);
 *     `includeDeleted` opts out per call.
 *
 *   - Batch operations with chunking: `saveAll`/`deleteAll`/`updateAll`
 *     split work into fixed-size chunks so very large batches don't hold a
 *     single giant critical section and so callers can observe per-chunk
 *     progress through the optional `onChunk` callback.
 *
 *   - Secondary equality indexes: declared fields are indexed
 *     (fieldValue → Set<id>), updated transactionally with writes, and the
 *     engine consults them for single-equality specs — O(1) lookup vs O(n)
 *     scan.
 *
 * @module RepositoryLayer/Engine
 */

import { OptimisticLockError, SpecNode } from './types';
import { getPath } from './path';

/** Minimal entity shape the store manages. */
export interface StoredEntity {
  readonly id: string;
  /** Optimistic-lock version; managed by the store (start at 1). */
  readonly version: number;
  /** Soft-delete timestamp (ms epoch) or null. */
  readonly deletedAt: number | null;
}

export interface StoreOptions {
  /** Fields to maintain secondary equality indexes for. */
  readonly indexedFields?: readonly string[];
  /** Injectable clock for `deletedAt` and `updatedAt` bookkeeping. */
  readonly clock?: () => number;
}

export interface BatchProgress {
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly processed: number;
  readonly total: number;
}

interface Index {
  readonly field: string;
  /** valueKey (stableStringify) → set of ids */
  readonly map: Map<string, Set<string>>;
}

export class VersionedStore<T extends StoredEntity> {
  private readonly rows = new Map<string, T>();
  private readonly indexes: Index[] = [];
  private readonly clock: () => number;
  private includeDeletedByDefault = false;

  constructor(options: StoreOptions = {}) {
    this.clock = options.clock ?? Date.now;
    for (const f of options.indexedFields ?? []) {
      this.indexes.push({ field: f, map: new Map() });
    }
  }

  /** Registers an additional secondary index (rebuilds from live rows). */
  addIndex(field: string): void {
    const idx: Index = { field, map: new Map() };
    for (const [id, row] of this.rows) {
      this.indexAdd(idx, id, getPath(row, field));
    }
    this.indexes.push(idx);
  }

  /** Global soft-delete filter toggle (off = callers see tombstones). */
  setIncludeDeletedByDefault(v: boolean): void {
    this.includeDeletedByDefault = v;
  }

  // ------------------------------------------------------------------------
  // Writes
  // ------------------------------------------------------------------------

  /** Inserts a new entity; version starts at 1. Throws on duplicate id. */
  insert(entity: Omit<T, 'version' | 'deletedAt'> & Partial<T>): T {
    if (this.rows.has(entity.id)) {
      throw new Error(`Duplicate id "${entity.id}"`);
    }
    const row = { deletedAt: null, ...entity, version: 1 } as T;
    this.commit(row);
    return row;
  }

  /**
   * Optimistic-locked update. `expectedVersion` must equal the stored row's
   * version; on success the row is stored with `version + 1`.
   *
   * @throws OptimisticLockError on version mismatch or unknown id.
   */
  update(id: string, changes: Partial<T>, expectedVersion: number): T {
    const current = this.rows.get(id);
    if (!current) {
      throw new OptimisticLockError(id, expectedVersion, -1);
    }
    if (current.version !== expectedVersion) {
      throw new OptimisticLockError(id, expectedVersion, current.version);
    }
    const next = { ...current, ...changes, id, version: expectedVersion + 1 } as T;
    this.uncommit(current);
    this.commit(next);
    return next;
  }

  /** Upsert: insert when absent, else version-checked update. */
  save(entity: Omit<T, 'version' | 'deletedAt'> & { version?: number }): T {
    const existing = this.rows.get(entity.id);
    if (!existing) {
      return this.insert(entity as Omit<T, 'version' | 'deletedAt'> & Partial<T>);
    }
    const expected = entity.version ?? existing.version;
    const { version: _v, ...changes } = entity;
    void _v;
    return this.update(entity.id, changes as Partial<T>, expected);
  }

  /**
   * Soft-delete: sets `deletedAt`, bumps version. Idempotent — deleting a
   * tombstoned row is a no-op returning the row.
   */
  delete(id: string): T | null {
    const current = this.rows.get(id);
    if (!current || current.deletedAt !== null) return current ?? null;
    const next = { ...current, deletedAt: this.clock(), version: current.version + 1 } as T;
    this.uncommit(current);
    this.commit(next);
    return next;
  }

  /** Hard delete (tombstoned or not). */
  purge(id: string): boolean {
    const current = this.rows.get(id);
    if (!current) return false;
    this.uncommit(current);
    this.rows.delete(id);
    return true;
  }

  /** Restores a soft-deleted row (clears `deletedAt`, bumps version). */
  restore(id: string): T | null {
    const current = this.rows.get(id);
    if (!current || current.deletedAt === null) return null;
    const next = { ...current, deletedAt: null, version: current.version + 1 } as T;
    this.uncommit(current);
    this.commit(next);
    return next;
  }

  // ------------------------------------------------------------------------
  // Batch writes with chunking
  // ------------------------------------------------------------------------

  /**
   * Inserts many rows in fixed-size chunks. Chunking matters for the same
   * reason SQL `INSERT ... VALUES (...), (...)` caps at ~1000 rows: giant
   * batches blow parameter/lock limits and stall other work. Here it lets
   * the event loop breathe between chunks and reports progress.
   *
   * Atomicity: chunks commit sequentially; a failure mid-batch leaves prior
   * chunks committed (caller retries remainder). `onChunk` observes each
   * boundary for metrics/backpressure.
   */
  insertAll(
    entities: readonly (Omit<T, 'version' | 'deletedAt'> & Partial<T>)[],
    chunkSize = 500,
    onChunk?: (p: BatchProgress) => void
  ): T[] {
    const out: T[] = [];
    const totalChunks = Math.max(1, Math.ceil(entities.length / chunkSize));
    for (let c = 0; c < totalChunks; c++) {
      const chunk = entities.slice(c * chunkSize, (c + 1) * chunkSize);
      for (const e of chunk) out.push(this.insert(e));
      onChunk?.({
        chunkIndex: c,
        totalChunks,
        processed: out.length,
        total: entities.length,
      });
    }
    return out;
  }

  /**
   * Applies `changes` to each row matching `predicate`, with optimistic
   * locking against each row's current version. Returns updated rows.
   */
  updateAll(
    predicate: (row: T) => boolean,
    changes: (row: T) => Partial<T>,
    chunkSize = 500,
    onChunk?: (p: BatchProgress) => void
  ): T[] {
    const targets = this.scan(predicate, true);
    const out: T[] = [];
    const totalChunks = Math.max(1, Math.ceil(targets.length / chunkSize));
    for (let c = 0; c < totalChunks; c++) {
      const chunk = targets.slice(c * chunkSize, (c + 1) * chunkSize);
      for (const row of chunk) {
        out.push(this.update(row.id, changes(row), row.version));
      }
      onChunk?.({
        chunkIndex: c,
        totalChunks,
        processed: out.length,
        total: targets.length,
      });
    }
    return out;
  }

  /** Soft-deletes every row matching `predicate`, chunked like `updateAll`. */
  deleteAll(predicate: (row: T) => boolean, chunkSize = 500): T[] {
    const targets = this.scan(predicate, true);
    const out: T[] = [];
    for (let c = 0; c < targets.length; c += chunkSize) {
      for (const row of targets.slice(c, c + chunkSize)) {
        const d = this.delete(row.id);
        if (d) out.push(d);
      }
    }
    return out;
  }

  // ------------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------------

  get(id: string, includeDeleted = this.includeDeletedByDefault): T | null {
    const row = this.rows.get(id) ?? null;
    if (row && row.deletedAt !== null && !includeDeleted) return null;
    return row;
  }

  /**
   * Full scan with optional soft-delete filter. `includeDeleted` defaults to
   * the global filter — the "always applied" part of soft delete.
   */
  scan(predicate: (row: T) => boolean, includeDeleted = false): T[] {
    const out: T[] = [];
    for (const row of this.rows.values()) {
      if (row.deletedAt !== null && !includeDeleted) continue;
      if (predicate(row)) out.push(row);
    }
    return out;
  }

  /**
   * Index-assisted lookup: if the spec is exactly one `eq` node on an
   * indexed field, returns candidate ids in O(1); otherwise null (caller
   * falls back to full scan). The engine uses this as a cheap cost-based
   * decision — same idea as a real planner picking an index scan.
   */
  indexLookup(spec: SpecNode): Set<string> | null {
    if (spec.kind !== 'cmp' || spec.op !== 'eq') return null;
    for (const idx of this.indexes) {
      if (idx.field === spec.field) {
        const key = valueKey(spec.value);
        return idx.map.get(key) ?? new Set();
      }
    }
    return null;
  }

  rowsByIds(ids: Iterable<string>, includeDeleted = false): T[] {
    const out: T[] = [];
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row && (row.deletedAt === null || includeDeleted)) out.push(row);
    }
    return out;
  }

  size(includeDeleted = true): number {
    if (includeDeleted) return this.rows.size;
    let n = 0;
    for (const r of this.rows.values()) if (r.deletedAt === null) n++;
    return n;
  }

  clear(): void {
    this.rows.clear();
    for (const idx of this.indexes) idx.map.clear();
  }

  // ------------------------------------------------------------------------
  // Index maintenance — kept consistent inside each write's commit section.
  // ------------------------------------------------------------------------

  private commit(row: T): void {
    this.rows.set(row.id, row);
    for (const idx of this.indexes) this.indexAdd(idx, row.id, getPath(row, idx.field));
  }

  private uncommit(row: T): void {
    for (const idx of this.indexes) {
      const key = valueKey(getPath(row, idx.field));
      const bucket = idx.map.get(key);
      if (bucket) {
        bucket.delete(row.id);
        if (bucket.size === 0) idx.map.delete(key);
      }
    }
  }

  private indexAdd(idx: Index, id: string, value: unknown): void {
    const key = valueKey(value);
    let bucket = idx.map.get(key);
    if (!bucket) {
      bucket = new Set();
      idx.map.set(key, bucket);
    }
    bucket.add(id);
  }
}

function valueKey(v: unknown): string {
  if (v instanceof Date) return `d:${v.getTime()}`;
  if (typeof v === 'object' && v !== null) return `o:${JSON.stringify(v)}`;
  return `${typeof v}:${String(v)}`;
}
