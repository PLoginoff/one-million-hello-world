/**
 * Reporting Engine2 — Pre-Computed Report Cache
 *
 * Expensive aggregate reports shouldn't re-scan the dataset on every
 * dashboard load. This cache stores materialized `ReportResult`s keyed by
 * a query fingerprint, with three invalidation axes:
 *
 *   1. TTL — entries older than `ttlMs` miss and are reaped lazily;
 *   2. Tags — entries tagged e.g. 'dataset:orders' are bulk-invalidated
 *      when the orders dataset changes (write-through invalidation);
 *   3. LRU — capacity bound evicts least-recently-used entries; a Map
 *      reinsertion trick gives O(1) get/touch without a linked list.
 *
 * A stampede guard is unnecessary here: `getOrCompute` is synchronous —
 * the first caller computes, everyone else hits the warm cache.
 *
 * Complexity: get/set/invalidate O(1) amortized; invalidateTag O(n).
 *
 * @module ReportingLayer/Engine2
 */

import { Clock, ReportResult, SystemClock } from '../reports/ReportTypes';

export interface CacheSetOptions {
  /** Entry lifetime; 0/omitted = defaultTtlMs, Infinity allowed. */
  readonly ttlMs?: number;
  /** Invalidation tags — convention: `dataset:<name>`. */
  readonly tags?: readonly string[];
}

export interface CacheEntryRecord {
  readonly key: string;
  readonly result: ReportResult;
  readonly storedAt: number;
  readonly expiresAt: number; // Infinity for immortal entries
  readonly tags: readonly string[];
  hits: number;
}

export interface CacheStats {
  readonly size: number;
  readonly capacity: number;
  readonly hits: number;
  readonly misses: number;
  /** hits / (hits + misses); 0 when no lookups. */
  readonly hitRate: number;
  readonly evictions: number;
  readonly invalidations: number;
}

export interface ReportCacheOptions {
  readonly clock?: Clock;
  /** Max entries before LRU eviction (default 256). */
  readonly capacity?: number;
  /** Default entry TTL in ms (default 5 min; Infinity allowed). */
  readonly defaultTtlMs?: number;
}

export class ReportCache {
  private readonly _clock: Clock;
  private readonly _capacity: number;
  private readonly _defaultTtl: number;
  /**
   * Map insertion order doubles as LRU order: on hit we delete+set to
   * move the entry to the "most recent" tail — O(1) LRU with zero extra
   * structures.
   */
  private readonly _entries = new Map<string, CacheEntryRecord>();
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private _invalidations = 0;

  constructor(options?: ReportCacheOptions) {
    this._clock = options?.clock ?? new SystemClock();
    this._capacity = options?.capacity ?? 256;
    this._defaultTtl = options?.defaultTtlMs ?? 5 * 60_000;
    if (this._capacity <= 0) throw new Error('capacity must be > 0');
  }

  /** Fresh (unexpired) entry, or null. Counts a hit/miss either way. */
  get(key: string): ReportResult | null {
    const e = this._entries.get(key);
    if (!e || e.expiresAt <= this._clock.now()) {
      if (e) this._entries.delete(key); // lazy reap of an expired entry
      this._misses++;
      return null;
    }
    e.hits++;
    this._hits++;
    // LRU touch: re-insert at tail.
    this._entries.delete(key);
    this._entries.set(key, e);
    return e.result;
  }

  /** Lookup without hit/miss accounting — for "is it warm?" checks. */
  peek(key: string): ReportResult | null {
    const e = this._entries.get(key);
    if (!e || e.expiresAt <= this._clock.now()) return null;
    return e.result;
  }

  set(key: string, result: ReportResult, options?: CacheSetOptions): void {
    const ttl = options?.ttlMs ?? this._defaultTtl;
    const rec: CacheEntryRecord = {
      key,
      result,
      storedAt: this._clock.now(),
      expiresAt: this._clock.now() + ttl,
      tags: options?.tags ?? [],
      hits: 0,
    };
    this._entries.delete(key); // refresh position
    this._entries.set(key, rec);
    // Evict LRU (head of iteration order) while over capacity.
    while (this._entries.size > this._capacity) {
      const lruKey = this._entries.keys().next().value as string;
      this._entries.delete(lruKey);
      this._evictions++;
    }
  }

  /** Cache-aside convenience: return warm value or compute+store. */
  getOrCompute(
    key: string,
    compute: () => ReportResult,
    options?: CacheSetOptions
  ): ReportResult {
    const hit = this.get(key);
    if (hit !== null) return hit;
    const result = compute();
    this.set(key, result, options);
    return result;
  }

  /** Drop every entry carrying `tag`. Returns entries removed. */
  invalidateTag(tag: string): number {
    let n = 0;
    for (const [k, e] of this._entries) {
      if (e.tags.includes(tag)) {
        this._entries.delete(k);
        n++;
      }
    }
    this._invalidations += n;
    return n;
  }

  invalidate(key: string): boolean {
    const had = this._entries.delete(key);
    if (had) this._invalidations++;
    return had;
  }

  /** Proactively reap expired entries (normally lazy on get). */
  prune(): number {
    const now = this._clock.now();
    let n = 0;
    for (const [k, e] of this._entries) {
      if (e.expiresAt <= now) {
        this._entries.delete(k);
        n++;
      }
    }
    return n;
  }

  /** Deterministic fingerprint for a query object (sorted keys, deep). */
  static fingerprint(query: unknown): string {
    return JSON.stringify(query, (_k, v: unknown) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const rec = v as Record<string, unknown>;
        return Object.keys(rec)
          .sort()
          .reduce<Record<string, unknown>>((acc, kk) => {
            acc[kk] = rec[kk];
            return acc;
          }, {});
      }
      return v;
    });
  }

  stats(): CacheStats {
    const lookups = this._hits + this._misses;
    return {
      size: this._entries.size,
      capacity: this._capacity,
      hits: this._hits,
      misses: this._misses,
      hitRate: lookups === 0 ? 0 : this._hits / lookups,
      evictions: this._evictions,
      invalidations: this._invalidations,
    };
  }
}
