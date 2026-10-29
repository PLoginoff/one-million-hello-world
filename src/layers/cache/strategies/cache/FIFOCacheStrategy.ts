/**
 * FIFO Cache Strategy
 *
 * Implements First-In-First-Out eviction policy.
 * When the cache reaches capacity, the oldest entry (by insertion order) is evicted.
 *
 * @module CacheLayer/Strategies
 */

import { ICacheStrategy, CacheStrategyConfig, CacheGetResult, CacheSetResult } from './ICacheStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';
import { CacheStats } from '../../domain/value-objects/CacheStats';
import { CacheError, CacheErrorCode } from '../../errors';

/**
 * Internal node for the FIFO queue
 */
interface FIFONode<T> {
  key: string;
  entry: CacheEntry<T>;
  next: FIFONode<T> | null;
}

/**
 * FIFO Cache Strategy Implementation
 *
 * Uses a singly-linked list combined with a Map for O(1) operations:
 * - Map provides O(1) key lookup
 * - Singly-linked list maintains insertion order (oldest at head, newest at tail)
 */
export class FIFOCacheStrategy<T = unknown> implements ICacheStrategy<T> {
  readonly name = 'FIFO';
  readonly version = '1.0.0';

  private _config!: CacheStrategyConfig;
  private _cache: Map<string, FIFONode<T>>;
  private _head: FIFONode<T> | null;
  private _tail: FIFONode<T> | null;
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

    // Update access metadata (but don't change position in FIFO)
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
      return { success: true, key, evicted: false };
    }

    // Check capacity
    let evicted = false;
    let evictedKey: string | undefined;

    if (this._cache.size >= this._config.maxSize) {
      const evictedNode = this._evictFIFO();
      if (evictedNode) {
        evicted = true;
        evictedKey = evictedNode.key;
        this._stats = this._stats.withEviction();
      }
    }

    // Create new node
    const entry = new CacheEntry(key, value, effectiveTTL, now);

    const newNode: FIFONode<T> = {
      key,
      entry,
      next: null,
    };

    this._cache.set(key, newNode);
    this._addToTail(newNode);
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

  private _addToTail(node: FIFONode<T>): void {
    if (!this._tail) {
      this._head = node;
      this._tail = node;
    } else {
      this._tail.next = node;
      this._tail = node;
    }
  }

  private _removeNode(node: FIFONode<T>): void {
    // Find the previous node
    let prev: FIFONode<T> | null = null;
    let current = this._head;

    while (current && current !== node) {
      prev = current;
      current = current.next;
    }

    if (!current) {
      return; // Node not found
    }

    if (prev) {
      prev.next = current.next;
    } else {
      this._head = current.next;
    }

    if (current === this._tail) {
      this._tail = prev;
    }

    this._cache.delete(node.key);
  }

  private _evictFIFO(): FIFONode<T> | null {
    if (!this._head) {
      return null;
    }

    const node = this._head;
    this._head = node.next;

    if (!this._head) {
      this._tail = null;
    }

    this._cache.delete(node.key);
    return node;
  }

  private _cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    // We need to iterate carefully since we're modifying the list
    let current = this._head;
    let prev: FIFONode<T> | null = null;

    while (current) {
      if (current.entry.ttl > 0 && now - current.entry.createdAt > current.entry.ttl) {
        const toRemove = current;
        current = current.next;

        if (prev) {
          prev.next = current;
        } else {
          this._head = current;
        }

        if (toRemove === this._tail) {
          this._tail = prev;
        }

        this._cache.delete(toRemove.key);
        cleaned++;
      } else {
        prev = current;
        current = current.next;
      }
    }

    this._stats = this._stats.withSize(this._cache.size);
    return cleaned;
  }
}