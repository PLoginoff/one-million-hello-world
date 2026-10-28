/**
 * Cache Strategy Interface
 *
 * Defines the contract for cache strategies that implement
 * different caching algorithms (LRU, LFU, TTL, Two-Tier, etc.).
 *
 * @module CacheLayer/Strategies
 */

import { CacheEntry } from '../../domain/entities/CacheEntry';
import { CacheStats } from '../../domain/value-objects/CacheStats';

/**
 * Configuration options for cache strategies
 */
export interface CacheStrategyConfig {
  /** Maximum number of entries the cache can hold */
  maxSize: number;
  /** Default TTL in milliseconds */
  defaultTTL: number;
  /** Whether to enable metrics collection */
  enableMetrics?: boolean;
  /** Custom serializer for values */
  serializer?: (value: unknown) => string;
  /** Custom deserializer for values */
  deserializer?: (data: string) => unknown;
}

/**
 * Result of a cache get operation
 */
export interface CacheGetResult<T> {
  /** Whether the key was found and not expired */
  hit: boolean;
  /** The cached value (if hit) */
  value?: T;
  /** The cache entry metadata (if hit) */
  entry?: CacheEntry<T>;
  /** The cache level the value came from */
  level?: string;
}

/**
 * Result of a cache set operation
 */
export interface CacheSetResult {
  /** Whether the set operation succeeded */
  success: boolean;
  /** The key that was set */
  key: string;
  /** Whether an eviction occurred to make space */
  evicted?: boolean;
  /** The key that was evicted (if any) */
  evictedKey?: string;
}

/**
 * Interface for cache strategies
 *
 * Implementations provide different caching algorithms:
 * - LRU: Least Recently Used eviction
 * - LFU: Least Frequently Used eviction
 * - TTL: Time-To-Live based expiration
 * - TwoTier: L1 (memory) + L2 (Redis) tiered caching
 *
 * @typeParam T - The type of values stored in the cache
 */
export interface ICacheStrategy<T = unknown> {
  /** Unique name identifying this strategy */
  readonly name: string;
  /** Strategy version */
  readonly version: string;

  /**
   * Initialize the strategy with configuration
   *
   * @param config - Strategy configuration
   */
  initialize(config: CacheStrategyConfig): void | Promise<void>;

  /**
   * Get a value from the cache
   *
   * @param key - Cache key
   * @returns Cache get result with hit/miss information
   */
  get(key: string): Promise<CacheGetResult<T>>;

  /**
   * Set a value in the cache
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Optional TTL in milliseconds (uses default if not provided)
   * @returns Cache set result
   */
  set(key: string, value: T, ttl?: number): Promise<CacheSetResult>;

  /**
   * Delete a value from the cache
   *
   * @param key - Cache key
   * @returns True if the key existed and was deleted
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clear all entries from the cache
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   *
   * @returns Current cache statistics
   */
  getStats(): CacheStats;

  /**
   * Check if a key exists in the cache (without updating access time)
   *
   * @param key - Cache key
   * @returns True if key exists and is not expired
   */
  has(key: string): Promise<boolean>;

  /**
   * Get all keys in the cache
   *
   * @returns Array of cache keys
   */
  keys(): Promise<string[]>;

  /**
   * Get the current number of entries in the cache
   *
   * @returns Number of entries
   */
  size(): Promise<number>;

  /**
   * Perform maintenance (cleanup expired entries, etc.)
   *
   * @returns Number of entries cleaned up
   */
  maintenance(): Promise<number>;

  /**
   * Shutdown the strategy and release resources
   */
  shutdown(): Promise<void>;
}

/**
 * Extended interface for strategies that support multi-level caching
 */
export interface IMultiLevelCacheStrategy<T = unknown> extends ICacheStrategy<T> {
  /** Get the L1 (primary) cache strategy */
  readonly l1Strategy: ICacheStrategy<T>;
  /** Get the L2 (secondary) cache strategy */
  readonly l2Strategy: ICacheStrategy<T> | null;

  /**
   * Promote a key from L2 to L1
   *
   * @param key - Cache key to promote
   * @returns True if promotion succeeded
   */
  promote(key: string): Promise<boolean>;

  /**
   * Demote a key from L1 to L2
   *
   * @param key - Cache key to demote
   * @returns True if demotion succeeded
   */
  demote(key: string): Promise<boolean>;
}
