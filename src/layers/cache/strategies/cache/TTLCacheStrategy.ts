/**
 * TTL Cache Strategy
 *
 * Implements Time-To-Live based expiration.
 * Entries automatically expire after their TTL elapses.
 * Supports both absolute TTL and sliding TTL (reset on access).
 *
 * @module CacheLayer/Strategies
 */

import { ICacheStrategy, CacheStrategyConfig, CacheGetResult, CacheSetResult } from './ICacheStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';
import { CacheStats } from '../../domain/value-objects/CacheStats';
import { CacheError, CacheErrorCode } from '../../errors';

/**
 * TTL Cache Strategy Implementation
 *
 * Uses a Map for storage and a priority queue (min-heap) for efficient
 * expiration tracking. Supports both absolute and sliding TTL modes.
 */
export class TTLCacheStrategy<T = unknown> implements ICacheStrategy<T> {
  readonly name = 'TTL';
  readonly version = '1.0.0';

  private _config!: CacheStrategyConfig;
  private _cache: Map<string, CacheEntry<T>>;
  private _expirationHeap: ExpirationEntry[];
  private _stats: CacheStats;
  private _cleanupInterval: ReturnType<typeof setInterval> | null;
  private _initialized: boolean;
  private _slidingTTL: boolean;

  constructor() {
    this._cache = new Map();
    this._expirationHeap = [];
    this._stats = new CacheStats();
    this._cleanupInterval = null;
    this._initialized = false;
    this._slidingTTL = false;
  }

  /**
   * Initialize the strategy with configuration
   */
  initialize(config: CacheStrategyConfig & { slidingTTL?: boolean }): void {
    if (this._initialized) {
      throw new CacheError(CacheErrorCode.INVALID_CONFIG, 'Strategy already initialized');
    }

    this._config = {
      maxSize: config.maxSize,
      defaultTTL: config.defaultTTL,
      enableMetrics: config.enableMetrics ?? true,
      serializer: config.serializer,
      deserializer: config.deserializer,
    };
    this._slidingTTL = config.slidingTTL ?? false;

    // Start periodic cleanup of expired entries
    this._cleanupInterval = setInterval(
      () => {
        this._cleanupExpired();
      },
      Math.min(this._config.defaultTTL, 60000)
    );

    this._initialized = true;
  }

  /**
   * Get a value from the cache
   */
  async get(key: string): Promise<CacheGetResult<T>> {
    this._ensureInitialized();

    const entry = this._cache.get(key);
    const now = Date.now();

    if (!entry) {
      this._stats = this._stats.withMiss();
      return { hit: false };
    }

    // Check TTL expiration
    if (entry.ttl > 0 && now - entry.createdAt > entry.ttl) {
      this._cache.delete(key);
      this._removeExpiration(key);
      this._stats = this._stats.withMiss().withSize(this._cache.size);
      return { hit: false };
    }

    // Update access metadata
    entry.recordAccess(now);

    // If sliding TTL, reset the expiration
    if (this._slidingTTL && entry.ttl > 0) {
      // Create new entry with updated createdAt (immutable)
      const updatedEntry = new CacheEntry(key, entry.value, entry.ttl, now);
      this._cache.set(key, updatedEntry);
      this._updateExpiration(key, now + entry.ttl);
    }

    this._stats = this._stats.withHit();

    return {
      hit: true,
      value: entry.value,
      entry,
      level: 'L1',
    };
  }

  /**
   * Set a value in the cache
   */
  async set(key: string, value: T, ttl?: number): Promise<CacheSetResult> {
    this._ensureInitialized();

    const now = Date.now();
    const effectiveTTL = ttl ?? this._config.defaultTTL;

    // Check if key already exists
    const existingEntry = this._cache.get(key);
    if (existingEntry) {
      // Update existing entry - replace with new CacheEntry (immutable)
      const updatedEntry = new CacheEntry(key, value, effectiveTTL, now);
      this._cache.set(key, updatedEntry);
      if (effectiveTTL > 0) {
        this._updateExpiration(key, now + effectiveTTL);
      } else {
        this._removeExpiration(key);
      }
      return { success: true, key, evicted: false };
    }

    // Check capacity (TTL strategy doesn't evict based on capacity by default,
    // but we can enforce maxSize if configured)
    let evicted = false;
    let evictedKey: string | undefined;

    if (this._cache.size >= this._config.maxSize) {
      const evictedKeyResult = this._evictOldest();
      if (evictedKeyResult) {
        evicted = true;
        evictedKey = evictedKeyResult;
        this._stats = this._stats.withEviction();
      }
    }

    // Create new entry
    const entry = new CacheEntry(key, value, effectiveTTL, now);

    this._cache.set(key, entry);

    if (effectiveTTL > 0) {
      this._addExpiration(key, now + effectiveTTL);
    }

    this._stats = this._stats.withSize(this._cache.size);

    return { success: true, key, evicted, evictedKey };
  }

  /**
   * Delete a value from the cache
   */
  async delete(key: string): Promise<boolean> {
    this._ensureInitialized();

    const existed = this._cache.delete(key);
    if (existed) {
      this._removeExpiration(key);
      this._stats = this._stats.withSize(this._cache.size);
    }
    return existed;
  }

  /**
   * Clear all entries from the cache
   */
  async clear(): Promise<void> {
    this._ensureInitialized();

    this._cache.clear();
    this._expirationHeap = [];
    this._stats = this._stats.withSize(0);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this._stats;
  }

  /**
   * Check if a key exists in the cache
   */
  async has(key: string): Promise<boolean> {
    this._ensureInitialized();

    const entry = this._cache.get(key);
    if (!entry) {
      return false;
    }

    const now = Date.now();
    if (entry.ttl > 0 && now - entry.createdAt > entry.ttl) {
      this._cache.delete(key);
      this._removeExpiration(key);
      this._stats = this._stats.withSize(this._cache.size);
      return false;
    }

    return true;
  }

  /**
   * Get all keys in the cache
   */
  async keys(): Promise<string[]> {
    this._ensureInitialized();
    await this._cleanupExpired();
    return Array.from(this._cache.keys());
  }

  /**
   * Get the current number of entries
   */
  async size(): Promise<number> {
    this._ensureInitialized();
    await this._cleanupExpired();
    return this._cache.size;
  }

  /**
   * Perform maintenance (cleanup expired entries)
   */
  async maintenance(): Promise<number> {
    this._ensureInitialized();
    return this._cleanupExpired();
  }

  /**
   * Shutdown the strategy and release resources
   */
  async shutdown(): Promise<void> {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    await this.clear();
    this._initialized = false;
  }

  /**
   * Get the remaining TTL for a key in milliseconds
   *
   * @param key - Cache key
   * @returns Remaining TTL in ms, or -1 if key doesn't exist, 0 if expired, Infinity if no TTL
   */
  async getRemainingTTL(key: string): Promise<number> {
    this._ensureInitialized();

    const entry = this._cache.get(key);
    if (!entry) {
      return -1;
    }

    if (entry.ttl <= 0) {
      return Infinity;
    }

    const now = Date.now();
    const remaining = entry.ttl - (now - entry.createdAt);
    return Math.max(0, remaining);
  }

  /**
   * Set the TTL for an existing key
   *
   * @param key - Cache key
   * @param ttl - New TTL in milliseconds (0 for no expiration)
   * @returns True if key existed and TTL was updated
   */
  async setTTL(key: string, ttl: number): Promise<boolean> {
    this._ensureInitialized();

    const entry = this._cache.get(key);
    if (!entry) {
      return false;
    }

    const now = Date.now();
    // Create new entry with updated TTL (immutable)
    const updatedEntry = new CacheEntry(key, entry.value, ttl, now);
    this._cache.set(key, updatedEntry);

    if (ttl > 0) {
      this._updateExpiration(key, now + ttl);
    } else {
      this._removeExpiration(key);
    }

    return true;
  }

  // Private helper methods

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new CacheError(CacheErrorCode.INVALID_CONFIG, 'Strategy not initialized. Call initialize() first.');
    }
  }

  private _addExpiration(key: string, expiresAt: number): void {
    this._expirationHeap.push({ key, expiresAt });
    this._heapifyUp(this._expirationHeap.length - 1);
  }

  private _updateExpiration(key: string, expiresAt: number): void {
    // Find and update the expiration entry
    for (let i = 0; i < this._expirationHeap.length; i++) {
      if (this._expirationHeap[i].key === key) {
        this._expirationHeap[i].expiresAt = expiresAt;
        this._heapifyUp(i);
        this._heapifyDown(i);
        return;
      }
    }
    // If not found, add new
    this._addExpiration(key, expiresAt);
  }

  private _removeExpiration(key: string): void {
    for (let i = 0; i < this._expirationHeap.length; i++) {
      if (this._expirationHeap[i].key === key) {
        // Swap with last element and remove
        const lastIndex = this._expirationHeap.length - 1;
        if (i !== lastIndex) {
          this._expirationHeap[i] = this._expirationHeap[lastIndex];
          this._heapifyDown(i);
          this._heapifyUp(i);
        }
        this._expirationHeap.pop();
        return;
      }
    }
  }

  private _cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    while (this._expirationHeap.length > 0 && this._expirationHeap[0].expiresAt <= now) {
      const expired = this._expirationHeap[0];
      const entry = this._cache.get(expired.key);

      // Double-check the entry still exists and is actually expired
      if (entry && entry.ttl > 0 && now - entry.createdAt > entry.ttl) {
        this._cache.delete(expired.key);
        cleaned++;
      }

      // Remove from heap
      const lastIndex = this._expirationHeap.length - 1;
      if (lastIndex > 0) {
        this._expirationHeap[0] = this._expirationHeap[lastIndex];
        this._heapifyDown(0);
      }
      this._expirationHeap.pop();
    }

    this._stats = this._stats.withSize(this._cache.size);
    return cleaned;
  }

  private _evictOldest(): string | null {
    // Evict the entry with the earliest expiration time
    // If no TTL, evict the oldest created entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this._cache.entries()) {
      const compareTime = entry.ttl > 0 ? entry.createdAt + entry.ttl : entry.createdAt;
      if (compareTime < oldestTime) {
        oldestTime = compareTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this._cache.delete(oldestKey);
      this._removeExpiration(oldestKey);
      return oldestKey;
    }

    return null;
  }

  // Min-heap operations for expiration tracking

  private _heapifyUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this._expirationHeap[index].expiresAt >= this._expirationHeap[parentIndex].expiresAt) {
        break;
      }
      [this._expirationHeap[index], this._expirationHeap[parentIndex]] = [
        this._expirationHeap[parentIndex],
        this._expirationHeap[index],
      ];
      index = parentIndex;
    }
  }

  private _heapifyDown(index: number): void {
    const length = this._expirationHeap.length;

    while (true) {
      let smallest = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (leftChild < length && this._expirationHeap[leftChild].expiresAt < this._expirationHeap[smallest].expiresAt) {
        smallest = leftChild;
      }
      if (
        rightChild < length &&
        this._expirationHeap[rightChild].expiresAt < this._expirationHeap[smallest].expiresAt
      ) {
        smallest = rightChild;
      }

      if (smallest === index) {
        break;
      }

      [this._expirationHeap[index], this._expirationHeap[smallest]] = [
        this._expirationHeap[smallest],
        this._expirationHeap[index],
      ];
      index = smallest;
    }
  }
}

/**
 * Internal structure for tracking expiration times
 */
interface ExpirationEntry {
  key: string;
  expiresAt: number;
}