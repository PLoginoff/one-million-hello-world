/**
 * Secrets Layer — Caching Provider Decorator
 *
 * Wraps a SecretProvider with an in-memory read cache:
 *
 *   - Positive cache: `get` hits stay cached for `ttlMs`. Writes through:
 *     `put`/`delete` invalidate the affected path immediately so readers
 *     never see a stale value after a rotation.
 *   - Negative cache: misses (`undefined`) are cached for
 *     `negativeTtlMs` — much shorter — so a hot miss-loop doesn't hammer the
 *     backend, but a just-created secret becomes visible quickly. This is
 *     the same asymmetry DNS resolvers use (NXDOMAIN TTL ≪ record TTL).
 *   - Versioned reads (`getVersion`) are cached under `path@version` —
 *     immutable keys, so they never need invalidation.
 *   - Statistics: hits / misses / negative-hits / invalidations exposed via
 *     `stats()` for the metrics layer.
 *
 * Data structure: Map + per-entry expiry (lazy expiry on read, no sweep
 * timer — fine for a cache whose entries are already short-lived).
 *
 * @module Secrets/Vault
 */

import {
  SecretProvider,
  SecretRead,
  SecretsClock,
} from './SecretTypes';

export interface SecretCacheOptions {
  /** TTL for hits (default 30_000). */
  readonly ttlMs?: number;
  /** TTL for misses (default 2_000). */
  readonly negativeTtlMs?: number;
  /** Max cached entries; LRU-ish eviction drops the oldest (default 1000). */
  readonly maxEntries?: number;
  readonly clock?: SecretsClock;
}

export interface SecretCacheStats {
  hits: number;
  misses: number;
  negativeHits: number;
  invalidations: number;
  size: number;
}

interface CacheEntry {
  value: SecretRead | null; // null = negative entry
  expiresAt: number;
  insertedAt: number;
}

export class CachedSecretProvider implements SecretProvider {
  readonly name: string;
  private readonly _inner: SecretProvider;
  private readonly _clock: SecretsClock;
  private readonly _ttlMs: number;
  private readonly _negTtlMs: number;
  private readonly _maxEntries: number;
  private readonly _cache = new Map<string, CacheEntry>();
  private _stats = { hits: 0, misses: 0, negativeHits: 0, invalidations: 0 };

  constructor(inner: SecretProvider, options: SecretCacheOptions = {}) {
    this._inner = inner;
    this.name = `cached(${inner.name})`;
    this._clock = options.clock ?? Date.now;
    this._ttlMs = options.ttlMs ?? 30_000;
    this._negTtlMs = options.negativeTtlMs ?? 2_000;
    this._maxEntries = options.maxEntries ?? 1000;
  }

  get inner(): SecretProvider {
    return this._inner;
  }

  async get(path: string): Promise<SecretRead | undefined> {
    const hit = this._lookup(`g:${path}`);
    if (hit !== undefined) {
      if (hit === null) {
        this._stats.negativeHits++;
        return undefined;
      }
      this._stats.hits++;
      return hit;
    }
    this._stats.misses++;
    const read = await this._inner.get(path);
    this._store(`g:${path}`, read ?? null, read === undefined, read?.expiresAt);
    return read;
  }

  async getVersion(path: string, version: number): Promise<SecretRead | undefined> {
    // Versioned reads are immutable — cache forever-ish (same TTL).
    const key = `v:${path}@${version}`;
    const hit = this._lookup(key);
    if (hit !== undefined) {
      if (hit === null) {
        this._stats.negativeHits++;
        return undefined;
      }
      this._stats.hits++;
      return hit;
    }
    this._stats.misses++;
    const read = await this._inner.getVersion(path, version);
    // Grace-window reads carry `expiresAt` — cap the cache entry there so a
    // cached superseded version is never served past its rotation window.
    this._store(key, read ?? null, false, read?.expiresAt);
    return read;
  }

  async put(path: string, value: string, createdBy?: string, metadata?: Record<string, string>): Promise<number> {
    const v = await this._inner.put(path, value, createdBy, metadata);
    this._invalidatePath(path);
    return v;
  }

  async delete(path: string): Promise<boolean> {
    const ok = await this._inner.delete(path);
    this._invalidatePath(path);
    return ok;
  }

  async list(pattern: string): Promise<ReadonlyArray<string>> {
    // List results aren't cached — listing is rare and staleness there is
    // harder to reason about (new paths don't invalidate prefix patterns).
    return this._inner.list(pattern);
  }

  async versions(path: string): Promise<ReadonlyArray<number>> {
    return this._inner.versions(path);
  }

  /** Drop every cached entry touching `path` (get + all version keys). */
  invalidate(path: string): void {
    this._invalidatePath(path);
  }

  invalidateAll(): void {
    this._cache.clear();
  }

  stats(): SecretCacheStats {
    return { ...this._stats, size: this._cache.size };
  }

  // ------------------------------------------------------------------ private

  private _lookup(key: string): SecretRead | null | undefined {
    const e = this._cache.get(key);
    if (e === undefined) return undefined;
    if (this._clock() > e.expiresAt) {
      this._cache.delete(key);
      return undefined;
    }
    return e.value;
  }

  private _store(key: string, value: SecretRead | null, negative: boolean, capExpiresAt?: number): void {
    if (this._cache.size >= this._maxEntries) {
      // Oldest-insertion eviction — Map preserves insertion order, so the
      // first key is the oldest live one.
      const oldest = this._cache.keys().next().value;
      if (oldest !== undefined) this._cache.delete(oldest);
    }
    const now = this._clock();
    let expiresAt = now + (negative ? this._negTtlMs : this._ttlMs);
    if (capExpiresAt !== undefined && capExpiresAt < expiresAt) {
      expiresAt = capExpiresAt;
    }
    this._cache.set(key, { value, expiresAt, insertedAt: now });
  }

  private _invalidatePath(path: string): void {
    this._stats.invalidations++;
    this._cache.delete(`g:${path}`);
    for (const k of [...this._cache.keys()]) {
      if (k.startsWith(`v:${path}@`)) this._cache.delete(k);
    }
  }
}
