/**
 * ReadQueryEngine — read-side query API over ProjectionStore.
 *
 * Query model:
 *   - `where`   — composable predicates over document fields
 *   - `orderBy` — sort on one or more fields
 *   - `offset` / `limit` — pagination
 *   - `select`  — project fields out of the document
 *
 * Query planning: the engine inspects the WHERE clause for `eq`/`in`
 * predicates on indexed fields; if found, it uses the index to fetch a
 * candidate id set, then filters remaining predicates. Otherwise it
 * falls back to a full collection scan — correct but O(n).
 *
 * Pagination is applied AFTER filtering + sorting, so `totalCount`
 * reflects the full match set (for client-side page counts) while the
 * returned `items` slice is bounded by offset/limit.
 *
 * @module ReadModelLayer/Implementations
 */

import { Collection, ProjectionStore, StoredDocument } from './ProjectionStore';

// ------------------------------------------------------------------ types

/**
 * Predicate operators. `eq` and `in` are index-friendly; others scan.
 * `contains` does substring / array-membership matching.
 */
export type Predicate =
  | { op: 'eq'; field: string; value: unknown }
  | { op: 'ne'; field: string; value: unknown }
  | { op: 'in'; field: string; values: unknown[] }
  | { op: 'lt' | 'lte' | 'gt' | 'gte'; field: string; value: number }
  | { op: 'contains'; field: string; value: unknown }
  | { op: 'exists'; field: string }
  | { op: 'notExists'; field: string }
  | { op: 'and'; predicates: Predicate[] }
  | { op: 'or'; predicates: Predicate[] }
  | { op: 'not'; predicate: Predicate };

/** Sort direction + field. */
export interface SortSpec {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
}

/** A read query. */
export interface ReadQuery {
  /** Target collection. */
  readonly collection: string;
  /** Predicate tree — combined with AND at top level. */
  readonly where?: Predicate;
  /** Sort order — evaluated left-to-right for multi-key sorts. */
  readonly orderBy?: SortSpec[];
  /** 0-based pagination. */
  readonly offset?: number;
  readonly limit?: number;
  /** Field projection — if set, returned items only carry these fields. */
  readonly select?: string[];
}

/** Page of results + metadata. */
export interface ReadResultPage<T = Record<string, unknown>> {
  readonly items: T[];
  readonly totalCount: number;
  readonly offset: number;
  readonly limit: number;
  /** True iff more results exist beyond offset+limit. */
  readonly hasMore: boolean;
  /** Elapsed query time. */
  readonly elapsedMs: number;
  /** Whether an index was used (diagnostic). */
  readonly usedIndex: boolean;
}

// ------------------------------------------------------------ evaluation

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

/** Evaluate a predicate against a single document. */
export function matches<T>(doc: StoredDocument<T>, pred: Predicate): boolean {
  switch (pred.op) {
    case 'eq': {
      const v = resolveField(doc.data, pred.field);
      return v === pred.value;
    }
    case 'ne': {
      const v = resolveField(doc.data, pred.field);
      return v !== pred.value;
    }
    case 'in': {
      const v = resolveField(doc.data, pred.field);
      return pred.values.includes(v);
    }
    case 'lt': {
      const v = resolveField(doc.data, pred.field);
      return typeof v === 'number' && v < pred.value;
    }
    case 'lte': {
      const v = resolveField(doc.data, pred.field);
      return typeof v === 'number' && v <= pred.value;
    }
    case 'gt': {
      const v = resolveField(doc.data, pred.field);
      return typeof v === 'number' && v > pred.value;
    }
    case 'gte': {
      const v = resolveField(doc.data, pred.field);
      return typeof v === 'number' && v >= pred.value;
    }
    case 'contains': {
      const v = resolveField(doc.data, pred.field);
      if (typeof v === 'string' && typeof pred.value === 'string') {
        return v.includes(pred.value);
      }
      if (Array.isArray(v)) {
        return v.includes(pred.value);
      }
      return false;
    }
    case 'exists':
      return resolveField(doc.data, pred.field) !== undefined;
    case 'notExists':
      return resolveField(doc.data, pred.field) === undefined;
    case 'and':
      return pred.predicates.every((p) => matches(doc, p));
    case 'or':
      return pred.predicates.some((p) => matches(doc, p));
    case 'not':
      return !matches(doc, pred.predicate);
  }
}

// ------------------------------------------------------------------ engine

export class ReadQueryEngine {
  private readonly _store: ProjectionStore;

  constructor(store: ProjectionStore) {
    this._store = store;
  }

  /**
   * Execute a query. Returns a page of matching documents.
   *
   * Plan:
   *   1. Fetch candidate set: index lookup if a usable eq/in predicate
   *      exists, else full scan.
   *   2. Filter: apply full predicate tree to candidates.
   *   3. Sort: stable multi-key sort (orderBy list applied in reverse).
   *   4. Paginate: slice offset..offset+limit.
   *   5. Project: apply `select` field whitelist if present.
   */
  query<T = Record<string, unknown>>(q: ReadQuery): ReadResultPage<T> {
    const start = Date.now();
    const collection = this._store.collection<T>(q.collection);

    // --- candidate set
    const { candidates, usedIndex } = this._plan<T>(collection, q.where);

    // --- filter
    const filtered = q.where ? candidates.filter((d) => matches(d, q.where!)) : candidates;

    // --- sort
    const sorted = this._sort<T>(filtered, q.orderBy);

    // --- paginate
    const offset = Math.max(0, q.offset ?? 0);
    const limit = Math.max(0, q.limit ?? 100);
    const page = sorted.slice(offset, offset + limit);

    // --- project
    const items = q.select
      ? page.map((d) => this._project<T>(d, q.select!))
      : page.map((d) => d.data as T);

    return {
      items,
      totalCount: sorted.length,
      offset,
      limit,
      hasMore: offset + limit < sorted.length,
      elapsedMs: Date.now() - start,
      usedIndex,
    };
  }

  /** Single-document query — like `query` but returns first match. */
  queryOne<T = Record<string, unknown>>(q: ReadQuery): T | undefined {
    const page = this.query<T>({ ...q, limit: 1 });
    return page.items[0];
  }

  /** Count matching docs without materializing them. */
  count(q: Omit<ReadQuery, 'limit' | 'offset' | 'orderBy' | 'select'>): number {
    const collection = this._store.collection(q.collection);
    const { candidates } = this._plan(collection, q.where);
    return q.where ? candidates.filter((d) => matches(d, q.where!)).length : candidates.length;
  }

  // ------------------------------------------------------------- planning

  /**
   * Find candidate doc set using an available index. Returns the full
   * collection when no index can satisfy a conjunct.
   */
  private _plan<T>(
    collection: Collection<T>,
    where: Predicate | undefined,
  ): { candidates: StoredDocument<T>[]; usedIndex: boolean } {
    if (!where) {
      return { candidates: collection.all() as StoredDocument<T>[], usedIndex: false };
    }

    // Look for top-level AND conjuncts we can satisfy via index.
    const conjuncts = where.op === 'and' ? where.predicates : [where];
    for (const c of conjuncts) {
      if (c.op === 'eq') {
        // Prefer the index path — O(1) lookup.
        const docs = collection.findByField(c.field, c.value);
        if (docs.length > 0 || collection.sortedIndex(c.field) !== undefined) {
          return { candidates: docs as StoredDocument<T>[], usedIndex: true };
        }
        // If unindexed, findByField already did a full scan — use result.
        return { candidates: docs as StoredDocument<T>[], usedIndex: false };
      }
      if (c.op === 'in') {
        const ids = new Set<string>();
        // Try each value via findByField — index used when available.
        for (const v of c.values) {
          for (const d of collection.findByField(c.field, v)) ids.add(d.id);
        }
        const docs: StoredDocument<T>[] = [];
        for (const id of ids) {
          const d = collection.get(id);
          if (d) docs.push(d);
        }
        return { candidates: docs, usedIndex: true };
      }
    }
    return { candidates: collection.all() as StoredDocument<T>[], usedIndex: false };
  }

  /**
   * Multi-key stable sort. Sort specs applied in REVERSE order so the
   * first spec ends up the dominant key (stable sort preserves earlier
   * orderings for equal keys).
   */
  private _sort<T>(docs: StoredDocument<T>[], orderBy: SortSpec[] | undefined): StoredDocument<T>[] {
    if (!orderBy || orderBy.length === 0) return docs;
    const out = [...docs];
    for (let i = orderBy.length - 1; i >= 0; i--) {
      const spec = orderBy[i];
      if (!spec) continue;
      const dir = spec.direction === 'asc' ? 1 : -1;
      out.sort((a, b) => {
        const av = resolveField(a.data, spec.field);
        const bv = resolveField(b.data, spec.field);
        // Numbers and strings are comparable; anything else falls back to
        // JSON comparison for determinism.
        if (typeof av === 'number' && typeof bv === 'number') {
          return dir * (av - bv);
        }
        if (typeof av === 'string' && typeof bv === 'string') {
          return dir * av.localeCompare(bv);
        }
        const aj = JSON.stringify(av);
        const bj = JSON.stringify(bv);
        if (aj === bj) return 0;
        return dir * (aj < bj ? -1 : 1);
      });
    }
    return out;
  }

  /** Field-projection — returns a shallow copy with only selected keys. */
  private _project<T>(doc: StoredDocument<T>, fields: string[]): T {
    const src = doc.data as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      out[f] = resolveField(src, f);
    }
    return out as T;
  }
}
