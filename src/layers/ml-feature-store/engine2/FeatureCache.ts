/**
 * Feature Cache — per-feature-TTL read-through cache.
 *
 * The online store already has TTL semantics per feature definition;
 * this cache sits *in front of* the online lookup for the common case
 * where the same entity is scored repeatedly in a burst (re-ranking,
 * batch inference). Each feature gets its own TTL — a real-time feature
 * might cache for seconds, a daily-batch feature for hours.
 *
 * Data structure: `Map<key, entry>` where key = `feature|entity`, plus
 * insertion-order LRU eviction via Map re-insertion (the standard
 * Map-based LRU idiom — get() re-inserts at the tail, evict pops head).
 * O(1) get/set/evict.
 *
 * @module MlFeatureStoreLayer/Engine2
 */

import { IClock, SystemClock } from '../../observability/engine/signals';
import { FeatureValue } from '../engine/FeatureStore';
import { CacheEntryMeta, FeatureCacheConfig, FeatureCacheStats } from './types';

const DEFAULTS: FeatureCacheConfig = {
  defaultTtlMs: 5 * 60_000,
  maxEntries: 10_000,
};

interface Entry {
  readonly feature: string;
  readonly value: FeatureValue;
  readonly storedAtMs: number;
  readonly expiresAtMs: number;
  hits: number;
}

export class FeatureCache {
  private readonly _config: FeatureCacheConfig;
  private readonly _clock: IClock;
  /** key → entry; Map order = LRU order (oldest first). */
  private readonly _entries = new Map<string, Entry>();
  /** feature → ttl override. */
  private readonly _ttl = new Map<string, number>();
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;

  constructor(config: Partial<FeatureCacheConfig> = {}, clock: IClock = new SystemClock()) {
    this._config = { ...DEFAULTS, ...config };
    this._clock = clock;
  }

  /** Override the TTL for a feature (ms). */
  setFeatureTtl(feature: string, ttlMs: number): void {
    this._ttl.set(feature, ttlMs);
  }

  /** Read-through get: cache hit or `loader` fallback. */
  get(feature: string, entity: string, loader: () => FeatureValue | undefined): FeatureValue | undefined {
    const key = `${feature}|${entity}`;
    const now = this._clock.nowMs();
    const e = this._entries.get(key);
    if (e && now < e.expiresAtMs) {
      e.hits += 1;
      this._hits += 1;
      // Refresh LRU position: delete + re-insert puts it at the tail.
      this._entries.delete(key);
      this._entries.set(key, e);
      return e.value;
    }
    if (e) this._entries.delete(key); // expired
    this._misses += 1;
    const value = loader();
    if (value !== undefined) this._put(key, feature, value, now);
    return value;
  }

  /** Prime the cache explicitly (e.g. after a batch write). */
  put(feature: string, entity: string, value: FeatureValue): void {
    const key = `${feature}|${entity}`;
    this._entries.delete(key);
    this._put(key, feature, value, this._clock.nowMs());
  }

  /** Drop every entry for a feature (feature recomputed). */
  invalidateFeature(feature: string): number {
    let removed = 0;
    for (const [k, e] of this._entries) {
      if (e.feature === feature) {
        this._entries.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  invalidate(feature: string, entity: string): boolean {
    return this._entries.delete(`${feature}|${entity}`);
  }

  /** Metadata for a live entry (undefined if absent/expired). */
  meta(feature: string, entity: string): CacheEntryMeta | undefined {
    const e = this._entries.get(`${feature}|${entity}`);
    if (!e || this._clock.nowMs() >= e.expiresAtMs) return undefined;
    return {
      feature: e.feature,
      storedAtMs: e.storedAtMs,
      expiresAtMs: e.expiresAtMs,
      hits: e.hits,
    };
  }

  /** Sweep expired entries; returns count reaped. */
  sweep(): number {
    const now = this._clock.nowMs();
    let removed = 0;
    for (const [k, e] of this._entries) {
      if (now >= e.expiresAtMs) {
        this._entries.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  stats(): FeatureCacheStats {
    const total = this._hits + this._misses;
    return {
      entries: this._entries.size,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      hitRate: total === 0 ? 0 : this._hits / total,
    };
  }

  private _put(key: string, feature: string, value: FeatureValue, now: number): void {
    const ttl = this._ttl.get(feature) ?? this._config.defaultTtlMs;
    this._entries.set(key, {
      feature,
      value,
      storedAtMs: now,
      expiresAtMs: now + ttl,
      hits: 0,
    });
    // LRU eviction — Map order keeps the oldest entry first.
    while (this._entries.size > this._config.maxEntries) {
      const oldest = this._entries.keys().next().value;
      if (oldest === undefined) break;
      this._entries.delete(oldest);
      this._evictions += 1;
    }
  }
}
