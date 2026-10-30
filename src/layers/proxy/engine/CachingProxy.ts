/**
 * CachingProxy
 *
 * Memoizing proxy with per-key TTL and stale-while-revalidate (SWR)
 * semantics, modeled on HTTP cache-control behavior:
 *
 *   FRESH   age <= ttl                    → serve, no fetch
 *   STALE   ttl < age <= ttl + swrWindow  → serve stale AND trigger one
 *                                          background revalidation
 *   EXPIRED age > ttl + swrWindow         → synchronous fetch
 *
 * Key derivation: `keyFn(method, args)` — default is a stable stringify of
 * method + args. Methods must opt in via `cacheMethod()` (or `cacheAll()`);
 * uncached methods pass straight through, keeping writes/mutations honest.
 *
 * Single-flight: concurrent misses for the same key share one in-flight
 * fetch promise, and concurrent SWR windows share one revalidation —
 * preventing the thundering-herd problem when a hot key goes stale.
 *
 * Eviction: bounded LRU — a Map maintaining insertion order gives O(1)
 * recency touch via delete+reinsert; on overflow the oldest entry (Map's
 * first key) is evicted.
 *
 * All timing goes through the injected `Clock`, so tests control time
 * deterministically — no `setInterval`, no real sleeps.
 *
 * @module ProxyLayer/Engine
 */

import { Clock, systemClock } from './types';

/**
 * Cache entry with staleness bookkeeping.
 */
interface CacheEntry {
  value: unknown;
  /** Epoch ms at which the value was stored. */
  storedAt: number;
  /** TTL override captured at store time (ms). */
  ttl: number;
  /** Number of times served (fresh or stale). */
  hits: number;
}

/**
 * Options for CachingProxy.
 */
export interface CachingProxyOptions {
  /** Default freshness window in ms. Default 60_000. */
  readonly ttl?: number;
  /**
   * Stale-while-revalidate window in ms. Within this window past TTL the
   * stale value is served while a background revalidation refreshes the
   * entry. 0 disables SWR. Default 0.
   */
  readonly staleWhileRevalidateMs?: number;
  /** Max entries; LRU eviction beyond. Default 1000. */
  readonly maxEntries?: number;
  /** Injectable clock. */
  readonly clock?: Clock;
  /** Cache-key derivation. Default `defaultKeyFn`. */
  readonly keyFn?: (method: string, args: readonly unknown[]) => string;
}

/**
 * Per-call result wrapper exposing cache provenance.
 */
export interface CachedInvocationResult<R> {
  readonly value: R;
  /** 'fresh' | 'stale' | 'miss' | 'bypass' */
  readonly cacheStatus: 'fresh' | 'stale' | 'miss' | 'bypass';
}

/**
 * Default cache key: method + stable JSON of args.
 * Handles key-order variance by sorting object keys recursively.
 */
export function defaultKeyFn(method: string, args: readonly unknown[]): string {
  return `${method}:${stableStringify(args)}`;
}

/**
 * Deterministic JSON stringify — object keys sorted so {a,b} === {b,a}.
 * O(n log n) in total key count; used only for key derivation.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'undefined' || typeof value === 'symbol') {
      return JSON.stringify(String(value));
    }
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export class CachingProxy<T extends object> {
  private readonly _target: T;
  private readonly _ttl: number;
  private readonly _swrWindow: number;
  private readonly _maxEntries: number;
  private readonly _clock: Clock;
  private readonly _keyFn: (method: string, args: readonly unknown[]) => string;

  private readonly _cache: Map<string, CacheEntry>;
  private readonly _cachedMethods: Set<string>;
  private readonly _ttlOverrides: Map<string, number>;
  private readonly _inflight: Map<string, Promise<unknown>>;
  private readonly _revalidating: Set<string>;

  private _hitCount: number;
  private _missCount: number;
  private _staleServed: number;
  private _revalidationCount: number;

  constructor(target: T, options: CachingProxyOptions = {}) {
    this._target = target;
    this._ttl = options.ttl ?? 60_000;
    this._swrWindow = options.staleWhileRevalidateMs ?? 0;
    this._maxEntries = options.maxEntries ?? 1000;
    this._clock = options.clock ?? systemClock;
    this._keyFn = options.keyFn ?? defaultKeyFn;

    this._cache = new Map();
    this._cachedMethods = new Set();
    this._ttlOverrides = new Map();
    this._inflight = new Map();
    this._revalidating = new Set();

    this._hitCount = 0;
    this._missCount = 0;
    this._staleServed = 0;
    this._revalidationCount = 0;
  }

  /**
   * Marks `method` as cacheable, optionally with a per-method TTL
   * overriding the proxy default.
   */
  cacheMethod(method: keyof T & string, ttlOverride?: number): this {
    this._cachedMethods.add(method);
    if (ttlOverride !== undefined) {
      this._ttlOverrides.set(method, ttlOverride);
    }
    return this;
  }

  /** Marks every function-valued own property of the target as cacheable. */
  cacheAll(): this {
    for (const key of Object.keys(this._target) as Array<keyof T & string>) {
      if (typeof this._target[key] === 'function') {
        this._cachedMethods.add(key);
      }
    }
    return this;
  }

  /** Removes `method` from the cacheable set. */
  uncache(method: keyof T & string): boolean {
    this._ttlOverrides.delete(method);
    return this._cachedMethods.delete(method);
  }

  /** True when `method` results may be served from cache. */
  isCacheable(method: keyof T & string): boolean {
    return this._cachedMethods.has(method);
  }

  /** Number of live entries (expired entries still count until evicted/swept). */
  get size(): number {
    return this._cache.size;
  }

  /** Aggregate counters for introspection. */
  get counters(): { hits: number; misses: number; staleServed: number; revalidations: number } {
    return {
      hits: this._hitCount,
      misses: this._missCount,
      staleServed: this._staleServed,
      revalidations: this._revalidationCount,
    };
  }

  /**
   * Invokes `method`, serving from cache when fresh or within the SWR
   * window. Non-cacheable methods bypass entirely.
   */
  async invoke<R = unknown>(
    method: keyof T & string,
    args: readonly unknown[] = []
  ): Promise<CachedInvocationResult<R>> {
    if (!this._cachedMethods.has(method)) {
      const value = await this._callTarget<R>(method, args);
      return { value, cacheStatus: 'bypass' };
    }

    const key = this._keyFn(method, args);
    const now = this._clock();
    const entry = this._cache.get(key);

    if (entry) {
      const ttl = entry.ttl;
      const age = now - entry.storedAt;
      if (age <= ttl) {
        // FRESH — move to most-recent position and serve.
        this._touch(key, entry);
        entry.hits += 1;
        this._hitCount += 1;
        return { value: entry.value as R, cacheStatus: 'fresh' };
      }
      if (this._swrWindow > 0 && age <= ttl + this._swrWindow) {
        // STALE — serve now, revalidate in background (single-flight).
        entry.hits += 1;
        this._hitCount += 1;
        this._staleServed += 1;
        this._revalidate(key, method, args);
        return { value: entry.value as R, cacheStatus: 'stale' };
      }
      // EXPIRED — drop and fall through to fetch.
      this._cache.delete(key);
    }

    // MISS — single-flight through _inflight.
    this._missCount += 1;
    const inflight = this._inflight.get(key);
    if (inflight) {
      const value = (await inflight) as R;
      return { value, cacheStatus: 'miss' };
    }

    const fetchPromise = this._callTarget<R>(method, args)
      .then((value) => {
        this._store(key, value, this._ttlOverrides.get(method) ?? this._ttl);
        return value;
      })
      .finally(() => {
        this._inflight.delete(key);
      });

    this._inflight.set(key, fetchPromise);
    const value = await fetchPromise;
    return { value, cacheStatus: 'miss' };
  }

  /**
   * Invalidates one key (derive with same keyFn) or all entries when no
   * method is given. `args` refine which entry of `method` is removed.
   */
  invalidate(method?: keyof T & string, args: readonly unknown[] = []): number {
    if (method === undefined) {
      const n = this._cache.size;
      this._cache.clear();
      return n;
    }
    if (args.length > 0) {
      return this._cache.delete(this._keyFn(method, args)) ? 1 : 0;
    }
    // Remove all entries for the method — keys start with "method:".
    const prefix = `${method}:`;
    let removed = 0;
    for (const key of [...this._cache.keys()]) {
      if (key.startsWith(prefix)) {
        this._cache.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Removes every entry older than its TTL + SWR window. Returns the count.
   * O(entries). Call periodically from the host scheduler if desired.
   */
  sweepExpired(): number {
    const now = this._clock();
    let removed = 0;
    for (const [key, entry] of [...this._cache.entries()]) {
      if (now - entry.storedAt > entry.ttl + this._swrWindow) {
        this._cache.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  // ---------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------

  private async _callTarget<R>(method: keyof T & string, args: readonly unknown[]): Promise<R> {
    const fn = this._target[method];
    if (typeof fn !== 'function') {
      throw new TypeError(`CachingProxy: '${method}' is not callable on target`);
    }
    return (await (fn as (...a: unknown[]) => unknown).apply(this._target, [...args])) as R;
  }

  private _store(key: string, value: unknown, ttl: number): void {
    // LRU insert: delete-then-set refreshes recency on overwrite.
    if (this._cache.has(key)) {
      this._cache.delete(key);
    } else if (this._cache.size >= this._maxEntries) {
      // Evict least-recently used = Map's first key. O(1).
      const oldest = this._cache.keys().next();
      if (!oldest.done) {
        this._cache.delete(oldest.value);
      }
    }
    this._cache.set(key, { value, storedAt: this._clock(), ttl, hits: 0 });
  }

  private _touch(key: string, entry: CacheEntry): void {
    this._cache.delete(key);
    this._cache.set(key, entry);
  }

  /**
   * Background revalidation — single-flight per key. Errors are swallowed:
   * stale data remains serveable and the next call may retry.
   */
  private _revalidate(key: string, method: keyof T & string, args: readonly unknown[]): void {
    if (this._revalidating.has(key)) {
      return;
    }
    this._revalidating.add(key);
    this._revalidationCount += 1;
    void this._callTarget(method, args)
      .then((value) => {
        this._store(key, value, this._ttlOverrides.get(method) ?? this._ttl);
      })
      .catch(() => {
        /* stale stays; best-effort refresh */
      })
      .finally(() => {
        this._revalidating.delete(key);
      });
  }
}
