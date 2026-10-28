/**
 * LRU Cache Strategy
 *
 * Implements Least Recently Used eviction policy.
 * When the cache reaches capacity, the least recently accessed entry is evicted.
 *
 * @module CacheLayer/Strategies
 */

import { ICacheStrategy, CacheStrategyConfig, CacheGetResult, CacheSetResult } from './ICacheStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';
import { CacheStats } from '../../domain/value-objects/CacheStats';
import { CacheError, CacheErrorCode } from '../../errors';

/**
 * Internal node for the doubly-linked list
 */
interface LRUNode<T> {
  key: string;
  entry: CacheEntry<T>;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
}

/**
 * LRU Cache Strategy Implementation
 *
 * Uses a doubly-linked list combined with a Map for O(1) operations:
 * - Map provides O(1) key lookup
 * - Doubly-linked list maintains access order (most recent at head, least recent at tail)
 */
export class LRUCacheStrategy<T = unknown> implements ICacheStrategy<T> {
  readonly name = 'LRU';
  readonly version = '1.0.0';

  private _config!: CacheStrategyConfig;
  private _cache: Map<string, LRUNode<T>>;
  private _head: LRUNode<T> | null;
  private _tail: LRUNode<T> | null;
  private _stats: CacheStats;
  private _cleanupInterval: ReturnType<typeof setInterval> | null;
  private _initialized: boolean;

  constructor() {
    this._cache = new Map();
    this._head = null;
    this._tail = null;
    this._stats = new CacheStats();
    this._cleanupInterval = null;
    this._initialized = false;
  }

  /**
   * Initialize the strategy with configuration
   */
  initialize(config: CacheStrategyConfig): void {
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

    // Start periodic cleanup of expired entries
    this._cleanupInterval = setInterval(
      () => {
        this._cleanupExpired();
      },
      Math.min(this._config.defaultTTL, 60000)
    ); // Cleanup at least every minute

    this._initialized = true;
  }

  /**
   * Get a value from the cache
   */
  async get(key: string): Promise<CacheGetResult<T>> {
    this._ensureInitialized();

    const node = this._cache.get(key);
    const now = Date.now();

    if (!node) {
      this._stats = this._stats.withMiss();
      return { hit: false };
    }

    // Check TTL expiration
    if (node.entry.ttl > 0 && now - node.entry.createdAt > node.entry.ttl) {
      this._removeNode(node);
      this._stats = this._stats.withMiss().withSize(this._cache.size);
      return { hit: false };
    }

    // Move to head (most recently used)
    this._moveToHead(node);

    // Update access metadata
    node.entry.recordAccess(now);

    this._stats = this._stats.withHit();

    return {
      hit: true,
      value: node.entry.value,
      entry: node.entry,
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
    const existingNode = this._cache.get(key);
    if (existingNode) {
      // Update existing entry - replace with new CacheEntry (immutable)
      const updatedEntry = new CacheEntry(key, value, effectiveTTL, now);
      existingNode.entry = updatedEntry;
      this._moveToHead(existingNode);
      return { success: true, key, evicted: false };
    }

    // Check capacity
    let evicted = false;
    let evictedKey: string | undefined;

    if (this._cache.size >= this._config.maxSize) {
      const evictedNode = this._evictLRU();
      if (evictedNode) {
        evicted = true;
        evictedKey = evictedNode.key;
        this._stats = this._stats.withEviction();
      }
    }

    // Create new node
    const entry = new CacheEntry(key, value, effectiveTTL, now);

    const newNode: LRUNode<T> = {
      key,
      entry,
      prev: null,
      next: null,
    };

    this._cache.set(key, newNode);
    this._addToHead(newNode);
    this._stats = this._stats.withSize(this._cache.size);

    return { success: true, key, evicted, evictedKey };
  }

  /**
   * Delete a value from the cache
   */
  async delete(key: string): Promise<boolean> {
    this._ensureInitialized();

    const node = this._cache.get(key);
    if (!node) {
      return false;
    }

    this._removeNode(node);
    this._stats = this._stats.withSize(this._cache.size);
    return true;
  }

  /**
   * Clear all entries from the cache
   */
  async clear(): Promise<void> {
    this._ensureInitialized();

    this._cache.clear();
    this._head = null;
    this._tail = null;
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

    const node = this._cache.get(key);
    if (!node) {
      return false;
    }

    const now = Date.now();
    if (node.entry.ttl > 0 && now - node.entry.createdAt > node.entry.ttl) {
      this._removeNode(node);
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

  // Private helper methods

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new CacheError(CacheErrorCode.INVALID_CONFIG, 'Strategy not initialized. Call initialize() first.');
    }
  }

  private _addToHead(node: LRUNode<T>): void {
    node.prev = null;
    node.next = this._head;

    if (this._head) {
      this._head.prev = node;
    }
    this._head = node;

    if (!this._tail) {
      this._tail = node;
    }
  }

  private _removeNode(node: LRUNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this._head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this._tail = node.prev;
    }

    this._cache.delete(node.key);
  }

  private _moveToHead(node: LRUNode<T>): void {
    if (node === this._head) {
      return;
    }
    this._removeNode(node);
    this._addToHead(node);
  }

  private _evictLRU(): LRUNode<T> | null {
    if (!this._tail) {
      return null;
    }

    const node = this._tail;
    this._removeNode(node);
    return node;
  }

  private _cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, node] of this._cache.entries()) {
      if (node.entry.ttl > 0 && now - node.entry.createdAt > node.entry.ttl) {
        this._removeNode(node);
        cleaned++;
      }
    }

    this._stats = this._stats.withSize(this._cache.size);
    return cleaned;
  }
}