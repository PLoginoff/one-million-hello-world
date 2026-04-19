/**
 * LRU Cache Provider
 * 
 * Least Recently Used cache provider.
 */

import { ICacheProvider, CacheEntry } from './ICacheProvider';

export class LRUCacheProvider<T = unknown> implements ICacheProvider<T> {
  private _cache: Map<string, CacheEntry<T>>;
  private _accessOrder: string[];
  private _maxEntries: number;
  private _defaultTTL: number;

  constructor(maxEntries: number = 1000, defaultTTL: number = 3600000) {
    this._cache = new Map();
    this._accessOrder = [];
    this._maxEntries = maxEntries;
    this._defaultTTL = defaultTTL;
  }

  get(key: string): T | undefined {
    const entry = this._cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this._removeFromOrder(key);
      this._cache.delete(key);
      return undefined;
    }

    entry.accessCount++;
    entry.lastAccessedAt = new Date();
    this._updateAccessOrder(key);
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
    this._updateAccessOrder(key);

    if (this._cache.size > this._maxEntries) {
      this._evictLRU();
    }
  }

  has(key: string): boolean {
    const entry = this._cache.get(key);
    if (!entry) {
      return false;
    }

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this._removeFromOrder(key);
      this._cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    this._removeFromOrder(key);
    return this._cache.delete(key);
  }

  clear(): void {
    this._cache.clear();
    this._accessOrder = [];
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
        this._removeFromOrder(key);
        this._cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Updates access order (moves key to end)
   */
  private _updateAccessOrder(key: string): void {
    this._removeFromOrder(key);
    this._accessOrder.push(key);
  }

  /**
   * Removes key from access order
   */
  private _removeFromOrder(key: string): void {
    const index = this._accessOrder.indexOf(key);
    if (index > -1) {
      this._accessOrder.splice(index, 1);
    }
  }

  /**
   * Evicts the least recently used entry
   */
  private _evictLRU(): void {
    const lruKey = this._accessOrder.shift();
    if (lruKey) {
      this._cache.delete(lruKey);
    }
  }

  /**
   * Gets the access order
   */
  getAccessOrder(): string[] {
    return [...this._accessOrder];
  }
}
