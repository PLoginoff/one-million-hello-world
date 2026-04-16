/**
 * Cache Interface
 * 
 * Defines the contract for caching operations with TTL and eviction policies.
 */

import {
  CacheResult,
  CacheConfig,
  CacheStats,
  EvictionPolicy,
  InvalidationStrategy,
  CacheKeyPattern,
} from '../types/cache-types';

/**
 * Interface for cache operations
 */
export interface ICache<T = unknown> {
  /**
   * Gets a value from cache
   * 
   * @param key - Cache key
   * @returns Cache result with value
   */
  get(key: string): Promise<CacheResult<T>>;

  /**
   * Sets a value in cache
   * 
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Optional TTL override
   * @returns Cache result
   */
  set(key: string, value: T, ttl?: number): Promise<CacheResult<void>>;

  /**
   * Deletes a value from cache
   * 
   * @param key - Cache key
   * @returns Cache result
   */
  delete(key: string): Promise<CacheResult<void>>;

  /**
   * Checks if a key exists in cache
   * 
   * @param key - Cache key
   * @returns Cache result with boolean
   */
  has(key: string): Promise<CacheResult<boolean>>;

  /**
   * Clears all values from cache
   * 
   * @returns Cache result
   */
  clear(): Promise<CacheResult<void>>;

  /**
   * Gets multiple values from cache
   * 
   * @param keys - Array of cache keys
   * @returns Cache result with map of values
   */
  getMany(keys: string[]): Promise<CacheResult<Map<string, T>>>;

  /**
   * Sets multiple values in cache
   * 
   * @param entries - Map of key-value pairs
   * @param ttl - Optional TTL override
   * @returns Cache result
   */
  setMany(entries: Map<string, T>, ttl?: number): Promise<CacheResult<void>>;

  /**
   * Deletes multiple values from cache
   * 
   * @param keys - Array of cache keys
   * @returns Cache result
   */
  deleteMany(keys: string[]): Promise<CacheResult<void>>;

  /**
   * Invalidates cache entries matching a pattern
   * 
   * @param pattern - Cache key pattern
   * @param strategy - Invalidation strategy
   * @returns Cache result
   */
  invalidate(pattern: CacheKeyPattern, strategy?: InvalidationStrategy): Promise<CacheResult<number>>;

  /**
   * Gets cache statistics
   * 
   * @returns Cache statistics
   */
  getStats(): CacheStats;

  /**
   * Resets cache statistics
   */
  resetStats(): void;

  /**
   * Sets cache configuration
   * 
   * @param config - Cache configuration
   */
  setConfig(config: Partial<CacheConfig>): void;

  /**
   * Gets current cache configuration
   * 
   * @returns Current cache configuration
   */
  getConfig(): CacheConfig;

  /**
   * Sets eviction policy
   * 
   * @param policy - Eviction policy
   */
  setEvictionPolicy(policy: EvictionPolicy): void;

  /**
   * Gets current eviction policy
   * 
   * @returns Current eviction policy
   */
  getEvictionPolicy(): EvictionPolicy;

  /**
   * Warms up cache with pre-defined data
   * 
   * @param data - Map of key-value pairs
   * @param ttl - Optional TTL override
   * @returns Cache result
   */
  warmUp(data: Map<string, T>, ttl?: number): Promise<CacheResult<void>>;

  /**
   * Gets the size of cache in bytes
   * 
   * @returns Cache size
   */
  getSize(): number;

  /**
   * Gets the number of entries in cache
   * 
   * @returns Number of entries
   */
  getEntryCount(): number;
}
