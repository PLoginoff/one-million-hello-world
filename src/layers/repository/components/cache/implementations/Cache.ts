/**
 * Cache Implementation
 * 
 * Concrete implementation of ICache.
 * Handles caching operations with TTL and eviction policies.
 */

import { ICache } from '../interfaces/ICache';
import {
  CacheResult,
  CacheConfig,
  CacheStats,
  EvictionPolicy,
  InvalidationStrategy,
  CacheKeyPattern,
  CacheEntry,
  CacheError,
} from '../types/cache-types';

export class Cache<T = unknown> implements ICache<T> {
  private _cache: Map<string, CacheEntry<T>>;
  private _config: CacheConfig;
  private _stats: CacheStats;

  constructor(config?: Partial<CacheConfig>) {
    this._cache = new Map();
    this._config = {
      enabled: true,
      defaultTTL: 60000,
      maxSize: 1000,
      evictionPolicy: EvictionPolicy.LRU,
      enableCompression: false,
      enableStats: true,
      ...config,
    };
    this._stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
      currentSize: 0,
      totalEntries: 0,
    };
  }

  async get(key: string): Promise<CacheResult<T>> {
    if (!this._config.enabled) {
      return { success: false, hit: false };
    }

    const entry = this._cache.get(key);

    if (!entry) {
      this._incrementMisses();
      return { success: false, hit: false };
    }

    if (this._isExpired(entry)) {
      this._cache.delete(key);
      this._incrementMisses();
      return { success: false, hit: false };
    }

    entry.accessCount++;
    entry.lastAccessed = new Date();
    this._incrementHits();

    return { success: true, data: entry.data, hit: true };
  }

  async set(key: string, value: T, ttl?: number): Promise<CacheResult<void>> {
    if (!this._config.enabled) {
      return { success: false, hit: false };
    }

    const entryTTL = ttl || this._config.defaultTTL;
    const now = new Date();

    const entry: CacheEntry<T> = {
      data: value,
      createdAt: now,
      expiresAt: new Date(now.getTime() + entryTTL),
      accessCount: 0,
      lastAccessed: now,
    };

    this._cache.set(key, entry);
    this._enforceMaxSize();

    return { success: true, hit: false };
  }

  async delete(key: string): Promise<CacheResult<void>> {
    if (!this._config.enabled) {
      return { success: false, hit: false };
    }

    this._cache.delete(key);
    return { success: true, hit: false };
  }

  async has(key: string): Promise<CacheResult<boolean>> {
    if (!this._config.enabled) {
      return { success: false, data: false, hit: false };
    }

    const entry = this._cache.get(key);

    if (!entry) {
      return { success: true, data: false, hit: false };
    }

    if (this._isExpired(entry)) {
      this._cache.delete(key);
      return { success: true, data: false, hit: false };
    }

    return { success: true, data: true, hit: true };
  }

  async clear(): Promise<CacheResult<void>> {
    this._cache.clear();
    this._resetStats();
    return { success: true, hit: false };
  }

  async getMany(keys: string[]): Promise<CacheResult<Map<string, T>>> {
    const result = new Map<string, T>();

    for (const key of keys) {
      const cacheResult = await this.get(key);
      if (cacheResult.success && cacheResult.data !== undefined) {
        result.set(key, cacheResult.data);
      }
    }

    return { success: true, data: result, hit: result.size > 0 };
  }

  async setMany(entries: Map<string, T>, ttl?: number): Promise<CacheResult<void>> {
    for (const [key, value] of entries) {
      await this.set(key, value, ttl);
    }

    return { success: true, hit: false };
  }

  async deleteMany(keys: string[]): Promise<CacheResult<void>> {
    for (const key of keys) {
      await this.delete(key);
    }

    return { success: true, hit: false };
  }

  async invalidate(pattern: CacheKeyPattern, strategy?: InvalidationStrategy): Promise<CacheResult<number>> {
    const regex = new RegExp(pattern.pattern);
    let count = 0;

    for (const key of this._cache.keys()) {
      if (regex.test(key)) {
        if (strategy === InvalidationStrategy.IMMEDIATE) {
          this._cache.delete(key);
          count++;
        }
      }
    }

    return { success: true, data: count, hit: false };
  }

  getStats(): CacheStats {
    this._updateStats();
    return { ...this._stats };
  }

  resetStats(): void {
    this._resetStats();
  }

  setConfig(config: Partial<CacheConfig>): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): CacheConfig {
    return { ...this._config };
  }

  setEvictionPolicy(policy: EvictionPolicy): void {
    this._config.evictionPolicy = policy;
  }

  getEvictionPolicy(): EvictionPolicy {
    return this._config.evictionPolicy;
  }

  async warmUp(data: Map<string, T>, ttl?: number): Promise<CacheResult<void>> {
    for (const [key, value] of data) {
      await this.set(key, value, ttl);
    }

    return { success: true, hit: false };
  }

  getSize(): number {
    let size = 0;
    for (const [key, entry] of this._cache) {
      size += key.length + JSON.stringify(entry.data).length;
    }
    return size;
  }

  getEntryCount(): number {
    return this._cache.size;
  }

  private _isExpired(entry: CacheEntry<T>): boolean {
    return new Date() > entry.expiresAt;
  }

  private _incrementHits(): void {
    if (!this._config.enableStats) return;
    this._stats.hits++;
  }

  private _incrementMisses(): void {
    if (!this._config.enableStats) return;
    this._stats.misses++;
  }

  private _incrementEvictions(): void {
    if (!this._config.enableStats) return;
    this._stats.evictions++;
  }

  private _updateStats(): void {
    if (!this._config.enableStats) return;

    const total = this._stats.hits + this._stats.misses;
    this._stats.hitRate = total > 0 ? this._stats.hits / total : 0;
    this._stats.currentSize = this.getSize();
    this._stats.totalEntries = this._cache.size;
  }

  private _resetStats(): void {
    this._stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
      currentSize: 0,
      totalEntries: 0,
    };
  }

  private _enforceMaxSize(): void {
    if (this._config.maxSize && this._cache.size > this._config.maxSize) {
      const entriesToEvict = this._cache.size - this._config.maxSize;

      switch (this._config.evictionPolicy) {
        case EvictionPolicy.LRU:
          this._evictLRU(entriesToEvict);
          break;
        case EvictionPolicy.LFU:
          this._evictLFU(entriesToEvict);
          break;
        case EvictionPolicy.FIFO:
          this._evictFIFO(entriesToEvict);
          break;
        case EvictionPolicy.TTL:
          this._evictExpired();
          break;
      }
    }
  }

  private _evictLRU(count: number): void {
    const entries = Array.from(this._cache.entries());
    entries.sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime());

    for (let i = 0; i < count && i < entries.length; i++) {
      this._cache.delete(entries[i][0]);
      this._incrementEvictions();
    }
  }

  private _evictLFU(count: number): void {
    const entries = Array.from(this._cache.entries());
    entries.sort((a, b) => a[1].accessCount - b[1].accessCount);

    for (let i = 0; i < count && i < entries.length; i++) {
      this._cache.delete(entries[i][0]);
      this._incrementEvictions();
    }
  }

  private _evictFIFO(count: number): void {
    const entries = Array.from(this._cache.entries());
    entries.sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime());

    for (let i = 0; i < count && i < entries.length; i++) {
      this._cache.delete(entries[i][0]);
      this._incrementEvictions();
    }
  }

  private _evictExpired(): void {
    const now = new Date();

    for (const [key, entry] of this._cache) {
      if (entry.expiresAt < now) {
        this._cache.delete(key);
        this._incrementEvictions();
      }
    }
  }
}
