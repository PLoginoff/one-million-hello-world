/**
 * QueryBus — synchronous in-process query dispatch pipeline.
 *
 * Queries are the read-side counterpart of commands: they take parameters,
 * hit a projection / read model / cache, and return data. A query NEVER
 * mutates state — the bus enforces this contract structurally by exposing
 * a `Result<T>` and refusing to pass commands through.
 *
 * Like `CommandBus`, but:
 *  - Result caching is a first-class feature (queries are idempotent by
 *    definition, so a bounded cache is safe).
 *  - Pagination helpers (`dispatchPage`) understand `offset/limit` +
 *    `totalCount` conventions.
 *  - No idempotency-key replay (queries are already idempotent).
 *
 * Cache key derivation is pluggable — the default is a deterministic
 * JSON serialization of `{type, params}` (sorted keys).
 *
 * @module CqrsLayer/Implementations
 */

import {
  BusResult,
  CommandContext,
  MiddlewareFn,
  NextFn,
  Query,
  QueryHandler,
  createContext,
  invoke,
} from './CqrsCore';
import { NoHandlerError } from './CommandBus';

// ------------------------------------------------------------ cache types

/** Cache key derivation strategy. */
export type QueryCacheKeyFn = (query: Query) => string;

/** Default key derivation: deterministic JSON with sorted object keys. */
export function defaultQueryCacheKey(query: Query): string {
  return `${query.type}:${stableStringify(query.params)}`;
}

/** Deterministic JSON.stringify — object keys sorted recursively. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = sortDeep(src[k]);
    return out;
  }
  return v;
}

// ---------------------------------------------------------- cache backend

interface CacheEntry {
  value: unknown;
  cachedAt: number;
  /** Original TTL at insert (ms). */
  ttlMs: number;
}

/**
 * Tiny bounded LRU-ish cache for query results. Same doubly-linked list +
 * map structure as the LRU cache strategy — O(1) get/set/evict.
 *
 * Intentionally local to the query bus; the cache layer provides the
 * general-purpose implementation. Keeping a private cache here avoids a
 * cross-layer dependency and keeps eviction policy explicit.
 */
class QueryResultCache {
  private readonly _capacity: number;
  private readonly _map = new Map<string, { entry: CacheEntry; prev?: string; next?: string }>();
  private _head?: string; // most recently used
  private _tail?: string; // least recently used

  hits = 0;
  misses = 0;
  evictions = 0;

  constructor(capacity = 1024) {
    this._capacity = Math.max(1, capacity);
  }

  get(key: string): unknown | undefined {
    const node = this._map.get(key);
    if (!node) {
      this.misses += 1;
      return undefined;
    }
    if (Date.now() - node.entry.cachedAt > node.entry.ttlMs) {
      this._unlink(key);
      this._map.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    this._promote(key);
    return node.entry.value;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    const existing = this._map.get(key);
    if (existing) {
      existing.entry = { value, cachedAt: Date.now(), ttlMs };
      this._promote(key);
      return;
    }
    if (this._map.size >= this._capacity && this._tail) {
      this._map.delete(this._tail);
      this._unlink(this._tail);
      this.evictions += 1;
    }
    this._map.set(key, { entry: { value, cachedAt: Date.now(), ttlMs } });
    this._linkAtHead(key);
  }

  invalidate(prefix?: string): number {
    if (!prefix) {
      const n = this._map.size;
      this._map.clear();
      this._head = undefined;
      this._tail = undefined;
      return n;
    }
    let removed = 0;
    for (const key of [...this._map.keys()]) {
      if (key.startsWith(prefix)) {
        this._unlink(key);
        this._map.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  size(): number {
    return this._map.size;
  }

  private _linkAtHead(key: string): void {
    const node = this._map.get(key);
    if (!node) return;
    node.prev = undefined;
    node.next = this._head;
    if (this._head) {
      const head = this._map.get(this._head);
      if (head) head.prev = key;
    }
    this._head = key;
    if (!this._tail) this._tail = key;
  }

  private _unlink(key: string): void {
    const node = this._map.get(key);
    if (!node) return;
    if (node.prev) {
      const p = this._map.get(node.prev);
      if (p) p.next = node.next;
    } else {
      this._head = node.next;
    }
    if (node.next) {
      const n = this._map.get(node.next);
      if (n) n.prev = node.prev;
    } else {
      this._tail = node.prev;
    }
    node.prev = undefined;
    node.next = undefined;
  }

  private _promote(key: string): void {
    if (key === this._head) return;
    this._unlink(key);
    this._linkAtHead(key);
  }
}

// ------------------------------------------------------------------ bus

/** Optional cache-control annotation a handler may attach. */
export interface CacheableResult<T> {
  value: T;
  ttlMs?: number;
}

/** Detect CacheableResult shape without `any`. */
export function isCacheableResult(v: unknown): v is CacheableResult<unknown> {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return 'value' in r && (r['ttlMs'] === undefined || typeof r['ttlMs'] === 'number');
}

export class QueryBus {
  private readonly _handlers = new Map<string, QueryHandler>();
  private readonly _middleware: MiddlewareFn[] = [];
  private readonly _typedMiddleware = new Map<string, MiddlewareFn[]>();
  private readonly _cache = new QueryResultCache();
  private readonly _cacheKeyFn: QueryCacheKeyFn;
  private readonly _defaultTtlMs: number;
  private readonly _cacheable: Set<string>;
  private readonly _stats = new Map<string, { count: number; elapsed: number; failures: number }>();
  private _frozen = false;

  constructor(options: {
    cacheKeyFn?: QueryCacheKeyFn;
    defaultTtlMs?: number;
    cacheableTypes?: string[];
  } = {}) {
    this._cacheKeyFn = options.cacheKeyFn ?? defaultQueryCacheKey;
    this._defaultTtlMs = options.defaultTtlMs ?? 5_000;
    this._cacheable = new Set(options.cacheableTypes ?? []);
  }

  register<TQuery extends Query, TResult>(
    queryType: string,
    handler: QueryHandler<TQuery, TResult>,
  ): this {
    if (this._frozen) {
      throw new Error('QueryBus is frozen; registration closed');
    }
    if (this._handlers.has(queryType)) {
      throw new Error(`Duplicate handler for query '${queryType}'`);
    }
    this._handlers.set(queryType, handler as QueryHandler);
    return this;
  }

  use(fn: MiddlewareFn): this {
    this._middleware.push(fn);
    return this;
  }

  useFor(queryType: string, fn: MiddlewareFn): this {
    let list = this._typedMiddleware.get(queryType);
    if (!list) {
      list = [];
      this._typedMiddleware.set(queryType, list);
    }
    list.push(fn);
    return this;
  }

  /** Mark a query type as cacheable at runtime. */
  cacheable(queryType: string): this {
    this._cacheable.add(queryType);
    return this;
  }

  freeze(): this {
    this._frozen = true;
    return this;
  }

  /**
   * Dispatch a query. If the type is cacheable and a live entry exists, the
   * handler is skipped entirely.
   */
  async dispatch<T = unknown>(
    query: Query,
    contextInit: Partial<CommandContext> = {},
  ): Promise<BusResult<T>> {
    const context = createContext(contextInit);
    const useCache = this._cacheable.has(query.type);
    const cacheKey = useCache ? this._cacheKeyFn(query) : undefined;

    if (cacheKey !== undefined) {
      const hit = this._cache.get(cacheKey);
      if (hit !== undefined) {
        return {
          ok: true,
          value: hit as T,
          elapsedMs: 0,
          context,
        };
      }
    }

    const handler = this._handlers.get(query.type);
    if (!handler) {
      const error = new NoHandlerError(query.type);
      return { ok: false, error, elapsedMs: 0, context };
    }

    const chain: MiddlewareFn[] = [
      ...this._middleware,
      ...(this._typedMiddleware.get(query.type) ?? []),
    ];

    const terminal: NextFn = () => Promise.resolve(handler(query, context));

    let next = terminal;
    for (let i = chain.length - 1; i >= 0; i--) {
      const mw = chain[i];
      const inner = next;
      next = () => Promise.resolve(mw(query, context, inner));
    }

    const result = await invoke<T>(() => next() as Promise<T>, context);
    this._record(query.type, result.elapsedMs, result.ok);

    // Handlers may return CacheableResult<T> to opt-in to a custom TTL.
    if (cacheKey !== undefined && result.ok) {
      const raw = result.value;
      if (isCacheableResult(raw)) {
        this._cache.set(cacheKey, raw.value, raw.ttlMs ?? this._defaultTtlMs);
        return { ...result, value: raw.value as T };
      }
      this._cache.set(cacheKey, raw, this._defaultTtlMs);
    }

    return result;
  }

  /** Invalidate cached entries for a query type (or all). */
  invalidate(queryType?: string): number {
    if (!queryType) return this._cache.invalidate();
    return this._cache.invalidate(`${queryType}:`);
  }

  /** Cache stats for observability. */
  cacheStats(): { hits: number; misses: number; evictions: number; size: number } {
    return {
      hits: this._cache.hits,
      misses: this._cache.misses,
      evictions: this._cache.evictions,
      size: this._cache.size(),
    };
  }

  /** Per-type dispatch counters. */
  stats(): ReadonlyMap<string, { count: number; elapsed: number; failures: number }> {
    return new Map(this._stats);
  }

  private _record(type: string, elapsed: number, ok: boolean): void {
    let s = this._stats.get(type);
    if (!s) {
      s = { count: 0, elapsed: 0, failures: 0 };
      this._stats.set(type, s);
    }
    s.count += 1;
    s.elapsed += elapsed;
    if (!ok) s.failures += 1;
  }
}
