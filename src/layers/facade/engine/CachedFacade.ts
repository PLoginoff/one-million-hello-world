/**
 * CachedFacade — response cache in front of facade operations.
 *
 * Wraps a facade method with memoization:
 *
 *   facade.get(id) ──> cache hit? ──yes──> return
 *                        │
 *                        no──> underlying.get(id) ──> store ──> return
 *
 * Design:
 *   - `keyFn(args)` maps call arguments to a cache key (the caller owns
 *     key construction — the facade never guesses identity);
 *   - bounded LRU store (Map insertion-order trick, same as the
 *     multi-level cache's L1);
 *   - per-entry TTL on the injected clock;
 *   - explicit `invalidate(key)` / `invalidatePrefix(prefix)` /
 *     `invalidateAll()` hooks — the "hard part" of caching is left to
 *     the caller who knows the domain;
 *   - `swr` (stale-while-revalidate): an expired entry within `swrMs`
 *     is served while one background refresh updates it;
 *   - negative results (`undefined`) are NOT cached — caching absence
 *     is a domain decision (use `cacheNulls` to opt in).
 *
 * Complexity: get O(1) + underlying call on miss.
 *
 * @module FacadeLayer/Engine
 */

import { FacadeEngineClock, SystemEngineClock } from './types';

export interface CachedFacadeOptions<K, A extends readonly unknown[], R> {
  /** Maps call args → cache key. */
  keyFn: (...args: A) => K;
  /** The wrapped operation. */
  fn: (...args: A) => Promise<R>;
  /** Entry TTL (ms); `0` = no expiry. Default 60s. */
  ttlMs?: number;
  /** Serve expired entries for this long while refreshing. Default 0. */
  swrMs?: number;
  /** Max entries before LRU eviction. Default 500. */
  maxEntries?: number;
  /** Cache `undefined` results too. Default false. */
  cacheNulls?: boolean;
  clock?: FacadeEngineClock;
}

interface FacadeEntry<R> {
  value: R;
  expiresAt: number;
  deadAt: number;
}

export interface CachedFacadeStats {
  hits: number;
  misses: number;
  staleHits: number;
  evictions: number;
  size: number;
}

export class CachedFacade<A extends readonly unknown[], R> {
  private readonly _clock: FacadeEngineClock;
  private readonly _keyFn: (...args: A) => unknown;
  private readonly _fn: (...args: A) => Promise<R>;
  private readonly _ttlMs: number;
  private readonly _swrMs: number;
  private readonly _maxEntries: number;
  private readonly _cacheNulls: boolean;

  private readonly _store = new Map<unknown, FacadeEntry<R>>();
  private readonly _refreshing = new Set<unknown>();

  private _hits = 0;
  private _misses = 0;
  private _stale = 0;
  private _evictions = 0;

  constructor(options: CachedFacadeOptions<unknown, A, R>) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._keyFn = options.keyFn;
    this._fn = options.fn;
    this._ttlMs = Math.max(0, options.ttlMs ?? 60_000);
    this._swrMs = Math.max(0, options.swrMs ?? 0);
    this._maxEntries = Math.max(1, options.maxEntries ?? 500);
    this._cacheNulls = options.cacheNulls ?? false;
  }

  /**
   * Call the wrapped operation; returns the cached value when live.
   * `undefined` results pass through uncached unless `cacheNulls`.
   */
  async call(...args: A): Promise<R> {
    const key = this._keyFn(...args);
    const now = this._clock.now();
    const e = this._store.get(key);

    if (e) {
      if (e.expiresAt <= 0 || now < e.expiresAt) {
        this._hits++;
        this._touch(key, e);
        return e.value;
      }
      if (now < e.deadAt) {
        this._stale++;
        this._touch(key, e);
        this._refresh(key, args);
        return e.value;
      }
      this._store.delete(key);
    }

    this._misses++;
    const value = await this._fn(...args);
    this._maybeStore(key, value);
    return value;
  }

  /** Force-refresh one key by calling the underlying op. */
  async refresh(...args: A): Promise<R> {
    const key = this._keyFn(...args);
    const value = await this._fn(...args);
    this._maybeStore(key, value);
    return value;
  }

  /** Drop one cached key. */
  invalidate(key: unknown): boolean {
    return this._store.delete(key);
  }

  /**
   * Drop every key whose string form starts with `prefix`.
   * O(#entries) — admin path, not hot path.
   */
  invalidatePrefix(prefix: string): number {
    let n = 0;
    for (const k of this._store.keys()) {
      if (String(k).startsWith(prefix)) {
        this._store.delete(k);
        n++;
      }
    }
    return n;
  }

  invalidateAll(): void {
    this._store.clear();
  }

  stats(): CachedFacadeStats {
    return {
      hits: this._hits,
      misses: this._misses,
      staleHits: this._stale,
      evictions: this._evictions,
      size: this._store.size,
    };
  }

  /* ---------------------------------------------------------------- */

  private _maybeStore(key: unknown, value: R): void {
    if (value === undefined && !this._cacheNulls) return;
    const now = this._clock.now();
    const expiresAt = this._ttlMs > 0 ? now + this._ttlMs : 0;
    const deadAt = this._ttlMs > 0 ? now + this._ttlMs + this._swrMs : 0;
    while (this._store.size >= this._maxEntries && !this._store.has(key)) {
      const oldest = this._store.keys().next().value;
      if (oldest === undefined) break;
      this._store.delete(oldest);
      this._evictions++;
    }
    this._store.set(key, { value, expiresAt, deadAt });
  }

  private _touch(key: unknown, e: FacadeEntry<R>): void {
    this._store.delete(key);
    this._store.set(key, e);
  }

  private _refresh(key: unknown, args: A): void {
    if (this._refreshing.has(key)) return;
    this._refreshing.add(key);
    void this._fn(...args)
      .then((v) => this._maybeStore(key, v))
      .catch(() => undefined)
      .finally(() => this._refreshing.delete(key));
  }
}
