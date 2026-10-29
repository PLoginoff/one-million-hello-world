/**
 * Random Cache Strategy
 *
 * Implements Random eviction policy.
 * When the cache reaches capacity, a random entry is evicted.
 * Simple but effective for certain workloads.
 *
 * @module CacheLayer/Strategies
 */

import { ICacheStrategy, CacheStrategyConfig, CacheGetResult, CacheSetResult } from './ICacheStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';
import { CacheStats } from '../../domain/value-objects/CacheStats';
import { CacheError, CacheErrorCode } from '../../errors';

/**
 * Random Cache Strategy Implementation
 *
 * Uses a Map for O(1) key lookup and an array for O(1) random selection.
 * The array stores keys, and when an entry is deleted, we swap with the last element
 * to maintain O(1) removal.
 */
export class RandomCacheStrategy<T = unknown> implements ICacheStrategy<T> {
  readonly name = 'Random';
  readonly version = '1.0.0';

  private _config!: CacheStrategyConfig;
  private _cache: Map<string, CacheEntry<T>>;
  private _keys: string[];
  private _keyToIndex: Map<string, number>;
  private _stats: CacheStats;
  private _cleanupInterval: ReturnType<typeof setInterval> | null;
  private _initialized: boolean;

  constructor() {
    this._cache = new Map();
    this._keys = [];
    this._keyToIndex = new Map();
    this._stats = new CacheStats();
    this._cleanupInterval = null;
    this._initialized = false;
  }

  /**
   * Initialize the strategy with configuration
   */
  initialize(config: CacheStrategyConfig): Promise<void> {
    if (this._initialized) {
      return Promise.reject(new CacheError(CacheErrorCode.INVALID_CONFIG, 'Strategy already initialized'));
    }

    this._config = {
      maxSize: config.maxSize,
      defaultTTL: config.defaultTTL,
      enableMetrics: config.enableMetrics ?? true,
      serializer: config.serializer,
      deserializer: config.deserializer,
    };

    // Start periodic cleanup of expired entries
    this._cleanupInterval = setInterval(
      () => {
        this._cleanupExpired();
      },
      Math.min(this._config.defaultTTL, 60000)
    );

    this._initialized = true;
    return Promise.resolve();
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
      this._removeKey(key);
      this._stats = this._stats.withMiss().withSize(this._cache.size);
      return { hit: false };
    }

    // Update access metadata
    entry.recordAccess(now);

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
      return { success: true, key, evicted: false };
    }

    // Check capacity
    let evicted = false;
    let evictedKey: string | undefined;

    if (this._cache.size >= this._config.maxSize) {
      const evictedKeyResult = this._evictRandom();
      if (evictedKeyResult) {
        evicted = true;
        evictedKey = evictedKeyResult;
        this._stats = this._stats.withEviction();
      }
    }

    // Create new entry
    const entry = new CacheEntry(key, value, effectiveTTL, now);

    this._cache.set(key, entry);
    this._addKey(key);
    this._stats = this._stats.withSize(this._cache.size);

    return { success: true, key, evicted, evictedKey };
  }

  /**
   * Delete a value from the cache
   */
  async delete(key: string): Promise<boolean> {
    this._ensureInitialized();

    if (!this._cache.has(key)) {
      return false;
    }

    this._removeKey(key);
    this._stats = this._stats.withSize(this._cache.size);
    return true;
  }

  /**
   * Clear all entries from the cache
   */
  async clear(): Promise<void> {
    this._ensureInitialized();

    this._cache.clear();
    this._keys = [];
    this._keyToIndex.clear();
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
      this._removeKey(key);
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
    return [...this._keys];
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

  // Private helper methods

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new CacheError(CacheErrorCode.INVALID_CONFIG, 'Strategy not initialized. Call initialize() first.');
    }
  }

  private _addKey(key: string): void {
    const index = this._keys.length;
    this._keys.push(key);
    this._keyToIndex.set(key, index);
  }

  private _removeKey(key: string): void {
    const index = this._keyToIndex.get(key);
    if (index === undefined) {
      return;
    }

    // Swap with last element for O(1) removal
    const lastKey = this._keys[this._keys.length - 1];
    this._keys[index] = lastKey;
    this._keyToIndex.set(lastKey, index);

    this._keys.pop();
    this._keyToIndex.delete(key);
    this._cache.delete(key);
  }

  private _evictRandom(): string | null {
    if (this._keys.length === 0) {
      return null;
    }

    // Pick a random index
    const randomIndex = Math.floor(Math.random() * this._keys.length);
    const keyToEvict = this._keys[randomIndex];

    this._removeKey(keyToEvict);
    return keyToEvict;
  }

  private _cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    // Iterate backwards to safely remove during iteration
    for (let i = this._keys.length - 1; i >= 0; i--) {
      const key = this._keys[i];
      const entry = this._cache.get(key);

      if (entry && entry.ttl > 0 && now - entry.createdAt > entry.ttl) {
        this._removeKey(key);
        cleaned++;
      }
    }

    this._stats = this._stats.withSize(this._cache.size);
    return cleaned;
  }
}