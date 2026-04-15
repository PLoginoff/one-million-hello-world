/**
 * Cache Manager Implementation
 * 
 * Concrete implementation of ICacheManager.
 * Handles multi-level caching and invalidation strategies.
 */

import { ICacheManager } from '../interfaces/ICacheManager';
import {
  CacheEntry,
  CacheStats,
  InvalidationStrategy,
  CacheLevel,
  CacheConfig,
  CacheResult,
} from '../types/cache-types';

export class CacheManager implements ICacheManager {
  private _cache: Map<string, CacheEntry<unknown>>;
  private _config: CacheConfig;
  private _stats: CacheStats;

  constructor() {
    this._cache = new Map();
    this._config = {
      maxSize: 1000,
      defaultTTL: 60000,
      invalidationStrategy: InvalidationStrategy.LRU,
      enableMultiLevel: false,
    };
    this._stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
    };
  }

  get<T>(key: string): CacheResult<T> {
    const entry = this._cache.get(key) as CacheEntry<T> | undefined;
    const now = Date.now();

    if (!entry) {
      this._stats.misses++;
      return { hit: false };
    }

    if (entry.ttl > 0 && now - entry.createdAt > entry.ttl) {
      this._cache.delete(key);
      this._stats.misses++;
      this._stats.size = this._cache.size;
      return { hit: false };
    }

    entry.accessCount++;
    entry.lastAccessedAt = now;
    this._stats.hits++;

    return {
      hit: true,
      value: entry.value,
      fromLevel: CacheLevel.L1,
    };
  }

  set<T>(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      value,
      ttl: ttl ?? this._config.defaultTTL,
      createdAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    };

    if (this._cache.size >= this._config.maxSize) {
      this._evict();
    }

    this._cache.set(key, entry as CacheEntry<unknown>);
    this._stats.size = this._cache.size;
  }

  delete(key: string): void {
    this._cache.delete(key);
    this._stats.size = this._cache.size;
  }

  clear(): void {
    this._cache.clear();
    this._stats.size = 0;
  }

  invalidate(pattern: string): void {
    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];

    for (const key of this._cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this._cache.delete(key);
    }

    this._stats.size = this._cache.size;
  }

  getStats(): CacheStats {
    return { ...this._stats };
  }

  setConfig(config: CacheConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): CacheConfig {
    return { ...this._config };
  }

  getEntries<T>(): CacheEntry<T>[] {
    return Array.from(this._cache.values()) as CacheEntry<T>[];
  }

  private _evict(): void {
    switch (this._config.invalidationStrategy) {
      case InvalidationStrategy.LRU:
        this._evictLRU();
        break;
      case InvalidationStrategy.LFU:
        this._evictLFU();
        break;
      default:
        this._evictLRU();
    }

    this._stats.evictions++;
    this._stats.size = this._cache.size;
  }

  private _evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this._cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this._cache.delete(oldestKey);
    }
  }

  private _evictLFU(): void {
    let leastAccessedKey: string | undefined;
    let leastAccessCount = Infinity;

    for (const [key, entry] of this._cache.entries()) {
      if (entry.accessCount < leastAccessCount) {
        leastAccessCount = entry.accessCount;
        leastAccessedKey = key;
      }
    }

    if (leastAccessedKey) {
      this._cache.delete(leastAccessedKey);
    }
  }
}
