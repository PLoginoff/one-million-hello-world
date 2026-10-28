/**
 * LFU Cache Strategy
 *
 * Implements Least Frequently Used eviction policy.
 * When the cache reaches capacity, the least frequently accessed entry is evicted.
 * Uses a frequency-based approach with aging to prevent cache pollution.
 *
 * @module CacheLayer/Strategies
 */

import { ICacheStrategy, CacheStrategyConfig, CacheGetResult, CacheSetResult } from './ICacheStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';
import { CacheStats } from '../../domain/value-objects/CacheStats';
import { CacheError, CacheErrorCode } from '../../errors';

/**
 * Frequency node for LFU implementation
 * Groups entries by access frequency
 */
interface FrequencyNode<T> {
  frequency: number;
  keys: Set<string>;
  prev: FrequencyNode<T> | null;
  next: FrequencyNode<T> | null;
}

/**
 * LFU Cache Strategy Implementation
 *
 * Uses a frequency list (doubly-linked list of frequency nodes) combined with a Map.
 * Each frequency node contains a set of keys with that access frequency.
 * This provides O(1) operations for get/set and efficient eviction of least frequent items.
 */
export class LFUCacheStrategy<T = unknown> implements ICacheStrategy<T> {
  readonly name = 'LFU';
  readonly version = '1.0.0';

  private _config!: CacheStrategyConfig;
  private _cache: Map<string, CacheEntry<T>>;
  private _keyToFreqNode: Map<string, FrequencyNode<T>>;
  private _freqHead: FrequencyNode<T> | null;
  private _freqTail: FrequencyNode<T> | null;
  private _minFrequency: number;
  private _stats: CacheStats;
  private _cleanupInterval: ReturnType<typeof setInterval> | null;
  private _initialized: boolean;
  private _agingInterval: ReturnType<typeof setInterval> | null;

  constructor() {
    this._cache = new Map();
    this._keyToFreqNode = new Map();
    this._freqHead = null;
    this._freqTail = null;
    this._minFrequency = 1;
    this._stats = new CacheStats();
    this._cleanupInterval = null;
    this._agingInterval = null;
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
    );

    // Start frequency aging (reduce all frequencies periodically to prevent cache pollution)
    this._agingInterval = setInterval(() => {
      this._ageFrequencies();
    }, 300000); // Every 5 minutes

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
      this._removeKey(key);
      this._stats = this._stats.withMiss().withSize(this._cache.size);
      return { hit: false };
    }

    // Increment frequency
    this._incrementFrequency(key, entry);

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
      this._resetFrequency(key);
      return { success: true, key, evicted: false };
    }

    // Check capacity
    let evicted = false;
    let evictedKey: string | undefined;

    if (this._cache.size >= this._config.maxSize) {
      const evictedKeyResult = this._evictLFU();
      if (evictedKeyResult) {
        evicted = true;
        evictedKey = evictedKeyResult;
        this._stats = this._stats.withEviction();
      }
    }

    // Create new entry with frequency 1
    const entry = new CacheEntry(key, value, effectiveTTL, now);

    this._cache.set(key, entry);
    this._addToFrequency(key, 1);
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
    this._keyToFreqNode.clear();
    this._freqHead = null;
    this._freqTail = null;
    this._minFrequency = 1;
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
    if (this._agingInterval) {
      clearInterval(this._agingInterval);
      this._agingInterval = null;
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

  private _addToFrequency(key: string, frequency: number): void {
    const freqNode = this._findOrCreateFrequencyNode(frequency);
    freqNode.keys.add(key);
    this._keyToFreqNode.set(key, freqNode);

    // Update min frequency
    if (frequency < this._minFrequency) {
      this._minFrequency = frequency;
    }
  }

  private _findOrCreateFrequencyNode(frequency: number): FrequencyNode<T> {
    // Search existing frequency nodes
    let current = this._freqHead;
    while (current) {
      if (current.frequency === frequency) {
        return current;
      }
      if (current.frequency > frequency) {
        break;
      }
      current = current.next;
    }

    // Create new frequency node
    const newNode: FrequencyNode<T> = {
      frequency,
      keys: new Set(),
      prev: null,
      next: null,
    };

    if (!this._freqHead) {
      this._freqHead = newNode;
      this._freqTail = newNode;
    } else if (!current) {
      // Insert at tail (highest frequency)
      newNode.prev = this._freqTail;
      if (this._freqTail) {
        this._freqTail.next = newNode;
      }
      this._freqTail = newNode;
    } else {
      // Insert before current
      newNode.prev = current.prev;
      newNode.next = current;
      if (current.prev) {
        current.prev.next = newNode;
      } else {
        this._freqHead = newNode;
      }
      current.prev = newNode;
    }

    return newNode;
  }

  private _incrementFrequency(key: string, entry: CacheEntry<T>): void {
    const freqNode = this._keyToFreqNode.get(key);
    if (!freqNode) {
      // Key not tracked, add at frequency 1
      this._addToFrequency(key, 1);
      return;
    }

    const currentFreq = freqNode.frequency;
    const newFreq = currentFreq + 1;

    // Remove from current frequency node
    freqNode.keys.delete(key);

    // If current frequency node is empty, remove it
    if (freqNode.keys.size === 0) {
      this._removeFrequencyNode(freqNode);
      // Update min frequency if needed
      if (this._minFrequency === currentFreq) {
        this._minFrequency = newFreq;
      }
    }

    // Add to new frequency node
    this._addToFrequency(key, newFreq);
  }

  private _resetFrequency(key: string): void {
    const freqNode = this._keyToFreqNode.get(key);
    if (freqNode) {
      freqNode.keys.delete(key);
      if (freqNode.keys.size === 0) {
        this._removeFrequencyNode(freqNode);
      }
    }
    this._addToFrequency(key, 1);
    this._minFrequency = 1;
  }

  private _removeFrequencyNode(node: FrequencyNode<T>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this._freqHead = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this._freqTail = node.prev;
    }
  }

  private _removeKey(key: string): void {
    const freqNode = this._keyToFreqNode.get(key);
    if (freqNode) {
      freqNode.keys.delete(key);
      if (freqNode.keys.size === 0) {
        this._removeFrequencyNode(freqNode);
      }
      this._keyToFreqNode.delete(key);
    }
    this._cache.delete(key);
  }

  private _evictLFU(): string | null {
    // Find the frequency node with minimum frequency
    let current = this._freqHead;
    while (current && current.frequency < this._minFrequency) {
      current = current.next;
    }

    if (!current || current.keys.size === 0) {
      // Fallback: find any non-empty frequency node
      current = this._freqHead;
      while (current && current.keys.size === 0) {
        current = current.next;
      }
    }

    if (!current || current.keys.size === 0) {
      return null;
    }

    // Evict the first key in the lowest frequency node
    const keyToEvict = current.keys.values().next().value;
    if (keyToEvict === undefined) {
      return null;
    }

    this._removeKey(keyToEvict);
    return keyToEvict;
  }

  private _cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this._cache.entries()) {
      if (entry.ttl > 0 && now - entry.createdAt > entry.ttl) {
        this._removeKey(key);
        cleaned++;
      }
    }

    this._stats = this._stats.withSize(this._cache.size);
    return cleaned;
  }

  private _ageFrequencies(): void {
    // Reduce all frequencies by half (with minimum of 1) to prevent cache pollution
    // This implements "aging" so that old frequently accessed items don't stay forever
    const keysToUpdate: Array<{ key: string; newFreq: number }> = [];

    for (const [key, freqNode] of this._keyToFreqNode.entries()) {
      const newFreq = Math.max(1, Math.floor(freqNode.frequency / 2));
      if (newFreq !== freqNode.frequency) {
        keysToUpdate.push({ key, newFreq });
      }
    }

    for (const { key, newFreq } of keysToUpdate) {
      const freqNode = this._keyToFreqNode.get(key);
      if (freqNode) {
        freqNode.keys.delete(key);
        if (freqNode.keys.size === 0) {
          this._removeFrequencyNode(freqNode);
        }
        this._addToFrequency(key, newFreq);
      }
    }

    // Update min frequency
    this._minFrequency = 1;
    let current = this._freqHead;
    while (current) {
      if (current.keys.size > 0) {
        this._minFrequency = current.frequency;
        break;
      }
      current = current.next;
    }
  }
}