/**
 * In-Memory Cache Provider
 * 
 * Cache provider that stores entries in memory.
 */

import { ICacheProvider, CacheEntry } from './ICacheProvider';

export class InMemoryCacheProvider<T = unknown> implements ICacheProvider<T> {
  private _cache: Map<string, CacheEntry<T>>;
  private _maxEntries: number;
  private _defaultTTL: number;

  constructor(maxEntries: number = 1000, defaultTTL: number = 3600000) {
    this._cache = new Map();
    this._maxEntries = maxEntries;
    this._defaultTTL = defaultTTL;
  }

  get(key: string): T | undefined {
    const entry = this._cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this._cache.delete(key);
      return undefined;
    }

    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const now = new Date();
    const ttlMs = ttl ?? this._defaultTTL;
    const entry: CacheEntry<T> = {
      key,
      value,
      expiresAt: new Date(now.getTime() + ttlMs),
      createdAt: now,
      accessCount: 0,
      lastAccessedAt: now,
    };

    this._cache.set(key, entry);

    if (this._cache.size > this._maxEntries) {
      this._evictOldest();
    }
  }

  has(key: string): boolean {
    const entry = this._cache.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this._cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this._cache.delete(key);
  }

  clear(): void {
    this._cache.clear();
  }

  size(): number {
    return this._cache.size;
  }

  keys(): string[] {
    return Array.from(this._cache.keys());
  }

  entries(): CacheEntry<T>[] {
    return Array.from(this._cache.values());
  }

  cleanup(): number {
    let removed = 0;
    const now = new Date();

    for (const [key, entry] of this._cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this._cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Evicts the oldest accessed entry
   */
  private _evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestAccess: Date | undefined;

    for (const [key, entry] of this._cache.entries()) {
      if (!oldestAccess || entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this._cache.delete(oldestKey);
    }
  }

  /**
   * Gets statistics
   */
  getStats(): {
    size: number;
    maxEntries: number;
    hitCount: number;
    missCount: number;
  } {
    const entries = this.entries();
    const hitCount = entries.reduce((sum, e) => sum + e.accessCount, 0);

    return {
      size: this.size(),
      maxEntries: this._maxEntries,
      hitCount,
      missCount: 0,
    };
  }

  /**
   * Sets the maximum number of entries
   */
  setMaxEntries(max: number): void {
    this._maxEntries = max;
    while (this._cache.size > this._maxEntries) {
      this._evictOldest();
    }
  }

  /**
   * Gets the maximum number of entries
   */
  getMaxEntries(): number {
    return this._maxEntries;
  }

  /**
   * Sets the default TTL
   */
  setDefaultTTL(ttl: number): void {
    this._defaultTTL = ttl;
  }

  /**
   * Gets the default TTL
   */
  getDefaultTTL(): number {
    return this._defaultTTL;
  }
}
