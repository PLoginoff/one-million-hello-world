/**
 * ProjectionStore — in-memory read-model storage with per-field indexes.
 *
 * Read models are denormalized document stores optimized for queries. The
 * store holds named "collections" (one per projection type); each document
 * has a stable `id` plus an opaque payload. Indexes are maintained on
 * declared fields so query predicates can be satisfied without scanning.
 *
 * Index strategy:
 *   - Equality index: `Map<fieldValue, Set<docId>>` — O(1) lookup for
 *     `eq` predicates, O(k) for `in` predicates.
 *   - Sorted index (for range/order): documents kept in a sorted array
 *     per field; binary search gives O(log n) range bounds. Implemented
 *     as an insertion-ordered B-tree-ish sorted array — good enough for
 *     in-memory workloads up to ~100k docs.
 *
 * Every document carries a `version` (monotonic per doc) and the
 * `appliedPosition` of the last event that produced it — used for
 * optimistic reads and consistency tracking.
 *
 * @module ReadModelLayer/Implementations
 */

// ------------------------------------------------------------------ types

/** A stored document. `data` is the projection payload. */
export interface StoredDocument<TData = Record<string, unknown>> {
  readonly id: string;
  /** Monotonically increasing per-document version (1-based). */
  readonly version: number;
  /** Global event position that produced this state (0 = none). */
  readonly appliedPosition: number;
  /** Wall-clock update time. */
  readonly updatedAt: number;
  /** Document payload. */
  readonly data: TData;
}

/** Options for upsert. */
export interface UpsertOptions {
  /** Expected current version — enables optimistic write detection. */
  readonly expectedVersion?: number;
  /** Global event position that produced this write. */
  readonly appliedPosition?: number;
}

export class VersionConflictError extends Error {
  readonly docId: string;
  readonly expected: number;
  readonly actual: number;
  constructor(docId: string, expected: number, actual: number) {
    super(`Version conflict on '${docId}': expected ${expected}, actual ${actual}`);
    this.name = 'VersionConflictError';
    this.docId = docId;
    this.expected = expected;
    this.actual = actual;
  }
}

/** Field path resolution — same dot-path convention as cqrs validation. */
function resolveField(data: unknown, path: string): unknown {
  if (typeof data !== 'object' || data === null) return undefined;
  const segments = path.split('.');
  let cur: unknown = data;
  for (const s of segments) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    const rec = cur as Record<string, unknown>;
    if (!(s in rec)) return undefined;
    cur = rec[s];
  }
  return cur;
}

/** Deterministic key for index buckets. */
function indexKey(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  const t = typeof v;
  if (t === 'string') return `s:${v as string}`;
  if (t === 'number') return `n:${v as number}`;
  if (t === 'boolean') return `b:${v as boolean}`;
  return `j:${JSON.stringify(v)}`;
}

// ------------------------------------------------------------ field index

/**
 * Equality index on a single field. Maintains `Map<key, Set<docId>>`;
 * supports `eq` / `in` lookups in O(1)/O(k). Removal requires knowing the
 * previous value — callers always index the OLD doc before overwriting.
 */
class EqualityIndex {
  readonly field: string;
  private readonly _buckets = new Map<string, Set<string>>();

  constructor(field: string) {
    this.field = field;
  }

  add(docId: string, data: unknown): void {
    const key = indexKey(resolveField(data, this.field));
    let bucket = this._buckets.get(key);
    if (!bucket) {
      bucket = new Set();
      this._buckets.set(key, bucket);
    }
    bucket.add(docId);
  }

  remove(docId: string, data: unknown): void {
    const key = indexKey(resolveField(data, this.field));
    const bucket = this._buckets.get(key);
    if (!bucket) return;
    bucket.delete(docId);
    if (bucket.size === 0) this._buckets.delete(key);
  }

  /** Find doc ids where field equals `value`. */
  eq(value: unknown): Set<string> {
    const bucket = this._buckets.get(indexKey(value));
    return bucket ? new Set(bucket) : new Set();
  }

  /** Find doc ids where field is in `values`. */
  in(values: readonly unknown[]): Set<string> {
    const out = new Set<string>();
    for (const v of values) {
      const bucket = this._buckets.get(indexKey(v));
      if (bucket) for (const id of bucket) out.add(id);
    }
    return out;
  }

  /** All distinct indexed values. */
  distinctValues(): unknown[] {
    // We can't reverse the key encoding — keep raw values per key instead.
    // For our use-case a values-list isn't required, so return keys.
    return [...this._buckets.keys()];
  }

  get size(): number {
    return this._buckets.size;
  }
}

/**
 * Sorted index on a numeric/comparable field. Keeps a sorted array of
 * `{value, docId}` pairs; range queries use binary search.
 *
 * Insert is O(n) worst case (array splice), but per-write cost is fine
 * for in-memory projections. For very hot fields, callers should prefer
 * a dedicated B-tree — this is a pragmatic stub.
 */
class SortedIndex {
  readonly field: string;
  private _entries: Array<{ value: number; docId: string }> = [];

  constructor(field: string) {
    this.field = field;
  }

  add(docId: string, data: unknown): void {
    const v = resolveField(data, this.field);
    if (typeof v !== 'number' || Number.isNaN(v)) return;
    // Binary search for insertion point (first index with value >= v).
    let lo = 0;
    let hi = this._entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const e = this._entries[mid];
      if (e && (e.value < v || (e.value === v && e.docId < docId))) lo = mid + 1;
      else hi = mid;
    }
    this._entries.splice(lo, 0, { value: v, docId });
  }

  remove(docId: string, data: unknown): void {
    const v = resolveField(data, this.field);
    if (typeof v !== 'number') return;
    // Find the {v, docId} pair — binary search then linear probe.
    let lo = 0;
    let hi = this._entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const e = this._entries[mid];
      if (e && e.value < v) lo = mid + 1;
      else hi = mid;
    }
    while (lo < this._entries.length && this._entries[lo]?.value === v) {
      if (this._entries[lo]?.docId === docId) {
        this._entries.splice(lo, 1);
        return;
      }
      lo += 1;
    }
  }

  /** docIds with value < bound. */
  lt(bound: number): Set<string> {
    const out = new Set<string>();
    for (const e of this._entries) {
      if (e.value >= bound) break;
      out.add(e.docId);
    }
    return out;
  }

  /** docIds with value <= bound. */
  lte(bound: number): Set<string> {
    const out = new Set<string>();
    for (const e of this._entries) {
      if (e.value > bound) break;
      out.add(e.docId);
    }
    return out;
  }

  /** docIds with value > bound. */
  gt(bound: number): Set<string> {
    const out = new Set<string>();
    for (let i = this._entries.length - 1; i >= 0; i--) {
      const e = this._entries[i];
      if (!e || e.value <= bound) break;
      out.add(e.docId);
    }
    return out;
  }

  /** docIds with value >= bound. */
  gte(bound: number): Set<string> {
    const out = new Set<string>();
    for (let i = this._entries.length - 1; i >= 0; i--) {
      const e = this._entries[i];
      if (!e || e.value < bound) break;
      out.add(e.docId);
    }
    return out;
  }

  /** Ascending iteration over (docId, value). */
  ascending(): Array<{ docId: string; value: number }> {
    return [...this._entries];
  }

  get size(): number {
    return this._entries.length;
  }
}

// --------------------------------------------------------------- collection

/**
 * A named document collection with its own index set. Equivalent to a
 * "table" or "projection type" in SQL terms.
 */
export class Collection<TData = Record<string, unknown>> {
  readonly name: string;
  private readonly _docs = new Map<string, StoredDocument<TData>>();
  private readonly _eqIndexes = new Map<string, EqualityIndex>();
  private readonly _sortedIndexes = new Map<string, SortedIndex>();

  constructor(name: string) {
    this.name = name;
  }

  /** Declare an equality index on `field`. Rebuilds from current docs. */
  indexBy(field: string): this {
    if (this._eqIndexes.has(field)) return this;
    const idx = new EqualityIndex(field);
    for (const doc of this._docs.values()) {
      idx.add(doc.id, doc.data);
    }
    this._eqIndexes.set(field, idx);
    return this;
  }

  /** Declare a sorted (range-capable) index on a numeric field. */
  sortedIndexBy(field: string): this {
    if (this._sortedIndexes.has(field)) return this;
    const idx = new SortedIndex(field);
    for (const doc of this._docs.values()) {
      idx.add(doc.id, doc.data);
    }
    this._sortedIndexes.set(field, idx);
    return this;
  }

  /** Insert or overwrite a document. */
  upsert(id: string, data: TData, options: UpsertOptions = {}): StoredDocument<TData> {
    const existing = this._docs.get(id);
    const currentVersion = existing?.version ?? 0;
    if (
      options.expectedVersion !== undefined &&
      options.expectedVersion !== currentVersion
    ) {
      throw new VersionConflictError(id, options.expectedVersion, currentVersion);
    }
    if (existing) {
      // Remove old index entries before overwriting.
      for (const idx of this._eqIndexes.values()) idx.remove(id, existing.data);
      for (const idx of this._sortedIndexes.values()) idx.remove(id, existing.data);
    }
    const doc: StoredDocument<TData> = {
      id,
      version: currentVersion + 1,
      appliedPosition: options.appliedPosition ?? existing?.appliedPosition ?? 0,
      updatedAt: Date.now(),
      data,
    };
    this._docs.set(id, doc);
    for (const idx of this._eqIndexes.values()) idx.add(id, data);
    for (const idx of this._sortedIndexes.values()) idx.add(id, data);
    return doc;
  }

  /** Partial update — merges `patch` into existing data. */
  patch(id: string, patch: Partial<TData>, options: UpsertOptions = {}): StoredDocument<TData> {
    const existing = this._docs.get(id);
    if (!existing) {
      throw new Error(`Document '${id}' not found in '${this.name}'`);
    }
    const merged = { ...(existing.data as Record<string, unknown>), ...(patch as Record<string, unknown>) } as TData;
    return this.upsert(id, merged, options);
  }

  /** Remove a document. Returns true iff it existed. */
  delete(id: string, options: { expectedVersion?: number } = {}): boolean {
    const existing = this._docs.get(id);
    if (!existing) return false;
    if (
      options.expectedVersion !== undefined &&
      options.expectedVersion !== existing.version
    ) {
      throw new VersionConflictError(id, options.expectedVersion, existing.version);
    }
    for (const idx of this._eqIndexes.values()) idx.remove(id, existing.data);
    for (const idx of this._sortedIndexes.values()) idx.remove(id, existing.data);
    this._docs.delete(id);
    return true;
  }

  /** Fetch by primary id — O(1). */
  get(id: string): StoredDocument<TData> | undefined {
    return this._docs.get(id);
  }

  /** Whether a doc exists. */
  has(id: string): boolean {
    return this._docs.has(id);
  }

  /** Scan all docs — the fallback when no index helps. */
  all(): StoredDocument<TData>[] {
    return [...this._docs.values()];
  }

  /** Index-aware equality lookup. Falls back to a full scan if unindexed. */
  findByField(field: string, value: unknown): StoredDocument<TData>[] {
    const idx = this._eqIndexes.get(field);
    if (idx) {
      const ids = idx.eq(value);
      const out: StoredDocument<TData>[] = [];
      for (const id of ids) {
        const d = this._docs.get(id);
        if (d) out.push(d);
      }
      return out;
    }
    // Full scan fallback.
    return this.all().filter((d) => resolveField(d.data, field) === value);
  }

  /** Range lookup via sorted index. Returns undefined if unindexed. */
  findByRange(
    field: string,
    op: 'lt' | 'lte' | 'gt' | 'gte',
    bound: number,
  ): StoredDocument<TData>[] | undefined {
    const idx = this._sortedIndexes.get(field);
    if (!idx) return undefined;
    const ids = idx[op](bound);
    const out: StoredDocument<TData>[] = [];
    for (const id of ids) {
      const d = this._docs.get(id);
      if (d) out.push(d);
    }
    return out;
  }

  /** Access the sorted index — used by the query engine for ORDER BY. */
  sortedIndex(field: string): SortedIndex | undefined {
    return this._sortedIndexes.get(field);
  }

  /** Drop all documents + indexes. */
  clear(): void {
    this._docs.clear();
    for (const idx of this._eqIndexes.values()) {
      // Rebuild a fresh empty index.
      const field = idx.field;
      this._eqIndexes.set(field, new EqualityIndex(field));
    }
    for (const idx of this._sortedIndexes.values()) {
      const field = idx.field;
      this._sortedIndexes.set(field, new SortedIndex(field));
    }
  }

  get size(): number {
    return this._docs.size;
  }
}

// ------------------------------------------------------------------ store

/**
 * Top-level store. Manages named `Collection`s, tracks global applied
 * position, and exposes `collection(name)` for typed access.
 */
export class ProjectionStore {
  private readonly _collections = new Map<string, Collection>();
  private _appliedPosition = 0;

  /** Get or lazily create a collection. */
  collection<TData = Record<string, unknown>>(name: string): Collection<TData> {
    let c = this._collections.get(name);
    if (!c) {
      c = new Collection(name);
      this._collections.set(name, c);
    }
    return c as Collection<TData>;
  }

  /** Whether a collection exists (was ever requested). */
  hasCollection(name: string): boolean {
    return this._collections.has(name);
  }

  /** Drop a collection entirely. */
  dropCollection(name: string): boolean {
    return this._collections.delete(name);
  }

  /** Collection names. */
  collectionNames(): string[] {
    return [...this._collections.keys()];
  }

  /**
   * Record the highest event position applied across all collections.
   * Called by updaters after each successful batch.
   */
  recordAppliedPosition(position: number): void {
    if (position > this._appliedPosition) this._appliedPosition = position;
  }

  /** Highest applied position — the read side's "caught up to" marker. */
  get appliedPosition(): number {
    return this._appliedPosition;
  }

  /** Aggregate stats for observability. */
  stats(): { collections: number; documents: number; appliedPosition: number } {
    let docs = 0;
    for (const c of this._collections.values()) docs += c.size;
    return {
      collections: this._collections.size,
      documents: docs,
      appliedPosition: this._appliedPosition,
    };
  }
}
