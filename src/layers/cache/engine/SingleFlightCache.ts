/**
 * SingleFlightCache — stampede (thundering-herd) protection.
 *
 * When a hot key expires, every concurrent request would otherwise run
 * the expensive loader simultaneously. This component collapses all
 * in-flight misses on the same key into ONE loader invocation whose
 * promise is shared by every waiter:
 *
 *   req1 ─┐
 *   req2 ─┼─> miss on "k" ──> single loader() ──> all waiters resolve
 *   req3 ─┘
 *
 * Design notes:
 *   - The in-flight map holds the *promise*, never the loader itself, so
 *     late arrivals during the load join the same future for free.
 *   - Failures are NOT cached: a rejected loader is removed from the
 *     in-flight map synchronously in `finally`, so the next request
 *     retries immediately. A negative-cache TTL (`negativeTtlMs`) is
 *     optionally available for "key provably absent" results — the
 *     loader signals absence by returning `undefined`, which is cached
 *     as a miss marker for a bounded window rather than failing forever.
 *   - `maxWaiters` bounds the waiter set per key; excess callers throw
 *     `StampedeLimitError` instead of queueing unboundedly.
 *   - An optional `swr` (stale-while-revalidate) mode serves the stale
 *     value to all but one caller, which refreshes in the background.
 *
 * Complexity: get is O(1) plus the loader cost shared by waiters;
 * memory is O(in-flight keys + waiter closures).
 *
 * @module CacheLayer/Engine
 */

import { CacheEngineClock, LoaderError, SystemEngineClock } from './types';

export class StampedeLimitError extends Error {
  readonly key: string;
  constructor(key: string, max: number) {
    super(`Too many concurrent waiters (${max}) for key "${key}"`);
    this.name = 'StampedeLimitError';
    this.key = key;
  }
}

/** Loader contract. Return `undefined` for "provably absent". */
export type CacheLoader<T> = (key: string) => Promise<T | undefined>;

export interface SingleFlightOptions {
  /** Max waiters sharing one in-flight load per key. Default 256. */
  maxWaiters?: number;
  /** TTL applied to values the loader returns (ms). `<=0` = no expiry. */
  valueTtlMs?: number;
  /**
   * TTL for "provably absent" results (ms). `0` disables negative
   * caching. Default 0.
   */
  negativeTtlMs?: number;
  /**
   * Stale-while-revalidate window (ms). When > 0, an expired value
   * within `valueTtlMs + swrMs` is served while exactly one caller
   * refreshes in background. Default 0 (off).
   */
  swrMs?: number;
  clock?: CacheEngineClock;
}

export interface SingleFlightResult<T> {
  /** `undefined` when the loader reported the key absent. */
  value: T | undefined;
  /** True when the value was returned from the value store, not a fresh load. */
  servedStale: boolean;
  /** True when this caller shared an in-flight load started by another caller. */
  shared: boolean;
}

export interface SingleFlightStats {
  /** Loader invocations actually performed. */
  loads: number;
  /** Calls that joined an in-flight load instead of starting a new one. */
  shared: number;
  /** Calls served from the value store (incl. SWR stale hits). */
  storeHits: number;
  /** Negative-cache hits. */
  negativeHits: number;
  /** Loader rejections observed. */
  loadFailures: number;
  /** Currently in-flight loads. */
  inFlight: number;
}

interface StoredValue<T> {
  value: T | undefined;
  /** Expiry of the *value*; SWR keeps it servable for `swrMs` longer. */
  expiresAt: number;
  /** Absolute deadline after which the record is fully dead. */
  deadAt: number;
}

interface InFlight<T> {
  promise: Promise<T | undefined>;
  waiters: number;
}

export class SingleFlightCache<T = unknown> {
  private readonly _loader: CacheLoader<T>;
  private readonly _clock: CacheEngineClock;
  private readonly _maxWaiters: number;
  private readonly _valueTtlMs: number;
  private readonly _negativeTtlMs: number;
  private readonly _swrMs: number;

  private readonly _store = new Map<string, StoredValue<T>>();
  private readonly _inFlight = new Map<string, InFlight<T>>();

  private _loads = 0;
  private _shared = 0;
  private _storeHits = 0;
  private _negativeHits = 0;
  private _loadFailures = 0;

  constructor(loader: CacheLoader<T>, options: SingleFlightOptions = {}) {
    this._loader = loader;
    this._clock = options.clock ?? new SystemEngineClock();
    this._maxWaiters = Math.max(1, options.maxWaiters ?? 256);
    this._valueTtlMs = options.valueTtlMs ?? 0;
    this._negativeTtlMs = options.negativeTtlMs ?? 0;
    this._swrMs = Math.max(0, options.swrMs ?? 0);
  }

  /**
   * Get `key`, loading it at most once across concurrent callers.
   *
   * Order of resolution:
   *   1. fresh value in store           → serve (`storeHits`)
   *   2. expired but within SWR window  → serve stale + background refresh
   *   3. in-flight load for key         → join its promise (`shared`)
   *   4. otherwise                      → start the load (`loads`)
   */
  async get(key: string): Promise<SingleFlightResult<T>> {
    const now = this._clock.now();
    const stored = this._store.get(key);

    if (stored) {
      if (stored.value === undefined) {
        // Negative record: deadAt governs (there is no SWR on misses).
        if (now < stored.deadAt) {
          this._negativeHits++;
          return { value: undefined, servedStale: false, shared: false };
        }
        this._store.delete(key);
      } else if (now < stored.expiresAt) {
        this._storeHits++;
        return { value: stored.value, servedStale: false, shared: false };
      } else if (now < stored.deadAt) {
        // SWR window: serve stale, refresh once in background.
        this._storeHits++;
        this._refreshInBackground(key);
        return { value: stored.value, servedStale: true, shared: false };
      } else {
        this._store.delete(key);
      }
    }

    const pending = this._inFlight.get(key);
    if (pending) {
      if (pending.waiters >= this._maxWaiters) {
        throw new StampedeLimitError(key, this._maxWaiters);
      }
      pending.waiters++;
      this._shared++;
      try {
        const v = await pending.promise;
        return { value: v, servedStale: false, shared: true };
      } finally {
        pending.waiters--;
      }
    }

    return this._load(key);
  }

  /** Force a fresh load and share it with concurrent callers. */
  async refresh(key: string): Promise<T | undefined> {
    const pending = this._inFlight.get(key);
    if (pending) return pending.promise;
    const r = await this._load(key);
    return r.value;
  }

  /** Drop a stored value so the next get reloads. */
  invalidate(key: string): boolean {
    return this._store.delete(key);
  }

  /** Drop all stored values; in-flight loads continue. */
  invalidateAll(): void {
    this._store.clear();
  }

  stats(): SingleFlightStats {
    return {
      loads: this._loads,
      shared: this._shared,
      storeHits: this._storeHits,
      negativeHits: this._negativeHits,
      loadFailures: this._loadFailures,
      inFlight: this._inFlight.size,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private _load(key: string): Promise<SingleFlightResult<T>> {
    const now = this._clock.now();
    const record: InFlight<T> = {
      waiters: 1,
      promise: Promise.resolve()
        .then(() => this._loader(key))
        .then((v) => {
          this._commit(key, v);
          return v;
        })
        .catch((err: unknown) => {
          this._loadFailures++;
          throw err instanceof LoaderError ? err : new LoaderError(key, err);
        }),
    };
    this._loads++;
    this._inFlight.set(key, record);
    // Remove from in-flight synchronously once settled so a follow-up
    // caller starts a new load rather than joining a finished one.
    record.promise
      .catch(() => undefined)
      .finally(() => {
        if (this._inFlight.get(key) === record) this._inFlight.delete(key);
      });
    void now;
    return record.promise.then((value) => ({ value, servedStale: false, shared: false }));
  }

  private _refreshInBackground(key: string): void {
    if (this._inFlight.has(key)) return; // someone already refreshing
    const record: InFlight<T> = {
      waiters: 0,
      promise: Promise.resolve()
        .then(() => this._loader(key))
        .then((v) => {
          this._commit(key, v);
          return v;
        })
        .catch(() => undefined as T | undefined),
    };
    this._loads++;
    this._inFlight.set(key, record);
    record.promise.finally(() => {
      if (this._inFlight.get(key) === record) this._inFlight.delete(key);
    });
  }

  private _commit(key: string, value: T | undefined): void {
    const now = this._clock.now();
    if (value === undefined) {
      if (this._negativeTtlMs > 0) {
        this._store.set(key, {
          value: undefined,
          expiresAt: now,
          deadAt: now + this._negativeTtlMs,
        });
      } else {
        this._store.delete(key);
      }
      return;
    }
    const expiresAt = this._valueTtlMs > 0 ? now + this._valueTtlMs : 0;
    const deadAt = this._valueTtlMs > 0 ? now + this._valueTtlMs + this._swrMs : 0;
    this._store.set(key, { value, expiresAt, deadAt });
  }
}
