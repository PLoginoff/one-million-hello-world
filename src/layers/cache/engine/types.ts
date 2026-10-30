/**
 * Cache Engine — shared types.
 *
 * Vocabulary:
 * - `CacheEngineClock`      — injectable monotonic clock; every component is
 *                             deterministic under test via `ManualEngineClock`.
 * - `BackingStore`          — async L2 store interface (Redis-shaped subset);
 *                             the engine never constructs a concrete store.
 * - `MultiLevelCache`       — L1 in-memory + L2 backing store with
 *                             write-through / write-behind coherence policies.
 * - `SingleFlightCache`     — stampede protection; concurrent misses on one
 *                             key collapse into a single loader invocation.
 * - `CacheWarmer`           — preloads a key set into the cache with bounded
 *                             concurrency so warming can't starve live traffic.
 * - `TagInvalidationIndex`  — bidirectional key<->tag index for O(1)-ish
 *                             tag-based invalidation.
 * - `AdaptiveTtlPolicy`     — adjusts per-key TTLs from observed hit rates:
 *                             keys that expire unused get longer TTLs, keys
 *                             that are frequently expired-but-hot get shorter
 *                             refresh horizons.
 *
 * All time is read through `CacheEngineClock`; nothing calls `Date.now()`
 * internally so tests can simulate TTL expiry, warming windows and
 * write-behind flush intervals deterministically.
 *
 * @module CacheLayer/Engine
 */

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** Monotonic clock; `now()` is milliseconds since an arbitrary epoch. */
export interface CacheEngineClock {
  now(): number;
}

export class SystemEngineClock implements CacheEngineClock {
  now(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests — `advance`/`set` are explicit. */
export class ManualEngineClock implements CacheEngineClock {
  private _t = 0;
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class CacheEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CacheEngineError';
    this.code = code;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class BackingStoreError extends CacheEngineError {
  constructor(message: string) {
    super('BACKING_STORE_ERROR', message);
    this.name = 'BackingStoreError';
  }
}

export class LoaderError extends CacheEngineError {
  readonly key: string;

  constructor(key: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super('LOADER_ERROR', `Loader for key "${key}" failed: ${detail}`);
    this.name = 'LoaderError';
    this.key = key;
  }
}

/* ------------------------------------------------------------------ */
/* Backing store (L2)                                                  */
/* ------------------------------------------------------------------ */

/**
 * Minimal async key/value contract for an L2 backing store.
 *
 * Deliberately a subset of what Redis/Memcached offer — just enough for
 * the multi-level cache to implement write-through and write-behind.
 * `null` (not `undefined`) signals "absent" so an L2 entry holding a
 * legitimately `undefined`-shaped payload is unambiguous; engine code
 * stores `T` (never `undefined`), so `null` is the only miss marker.
 */
export interface BackingStore<T = unknown> {
  /** Fetch a value; `null` when absent. Implementations may throw. */
  get(key: string): Promise<T | null>;
  /** Persist a value; `ttlMs <= 0` means "no expiry". */
  set(key: string, value: T, ttlMs: number): Promise<void>;
  /** Remove a key; resolves `true` if the key existed. */
  delete(key: string): Promise<boolean>;
  /** Optional multi-get for warming; default falls back to per-key get. */
  mget?(keys: readonly string[]): Promise<ReadonlyArray<T | null>>;
}

/**
 * In-memory `BackingStore` with the same async surface — useful for tests,
 * for an L2 that is just a bigger process-local map, and as a reference
 * implementation of the contract.
 */
export class InMemoryBackingStore<T = unknown> implements BackingStore<T> {
  private readonly _map = new Map<string, { value: T; expiresAt: number }>();
  private readonly _clock: CacheEngineClock;
  /** Counters useful in tests to assert write-behind batching. */
  reads = 0;
  writes = 0;
  deletes = 0;

  constructor(clock: CacheEngineClock = new SystemEngineClock()) {
    this._clock = clock;
  }

  async get(key: string): Promise<T | null> {
    this.reads++;
    const rec = this._map.get(key);
    if (!rec) return null;
    if (rec.expiresAt > 0 && this._clock.now() >= rec.expiresAt) {
      this._map.delete(key);
      return null;
    }
    return rec.value;
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    this.writes++;
    const expiresAt = ttlMs > 0 ? this._clock.now() + ttlMs : 0;
    this._map.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<boolean> {
    this.deletes++;
    return this._map.delete(key);
  }

  async mget(keys: readonly string[]): Promise<ReadonlyArray<T | null>> {
    const out: Array<T | null> = [];
    for (const k of keys) out.push(await this.get(k));
    return out;
  }

  get size(): number {
    return this._map.size;
  }

  /** Force-peek without expiry checks (test helper). */
  peek(key: string): T | null {
    return this._map.get(key)?.value ?? null;
  }
}

/** FNV-1a 32-bit hash — deterministic, dependency-free key hashing. */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/* ------------------------------------------------------------------ */
/* Shared record shapes                                                */
/* ------------------------------------------------------------------ */

/** Where a served value came from (renamed to avoid clash with domain CacheLevel enum). */
export type CacheServeLevel = 'L1' | 'L2' | 'loader' | 'miss';

/** Write-coherence policy between L1 and L2. */
export type WritePolicy = 'write-through' | 'write-behind' | 'write-around';

/** Per-call options understood by the multi-level cache. */
export interface CacheAccessOptions {
  /** Override TTL for this write (ms). `<= 0` = no expiry. */
  ttlMs?: number;
  /** Tags to associate with the key (see `TagInvalidationIndex`). */
  tags?: readonly string[];
  /** Skip L1 read (force L2/loader consult). */
  bypassL1?: boolean;
}
