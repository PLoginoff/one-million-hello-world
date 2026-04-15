/**
 * Cache Manager Interface
 * 
 * Defines the contract for cache operations
 * including multi-level caching and invalidation strategies.
 */

import {
  CacheEntry,
  CacheStats,
  InvalidationStrategy,
  CacheLevel,
  CacheConfig,
  CacheResult,
} from '../types/cache-types';

/**
 * Interface for cache operations
 */
export interface ICacheManager {
  /**
   * Gets a value from cache
   * 
   * @param key - Cache key
   * @returns Cache result
   */
  get<T>(key: string): CacheResult<T>;

  /**
   * Sets a value in cache
   * 
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in milliseconds
   */
  set<T>(key: string, value: T, ttl?: number): void;

  /**
   * Deletes a value from cache
   * 
   * @param key - Cache key
   */
  delete(key: string): void;

  /**
   * Clears all cache entries
   */
  clear(): void;

  /**
   * Invalidates cache entries by pattern
   * 
   * @param pattern - Pattern to match
   */
  invalidate(pattern: string): void;

  /**
   * Gets cache statistics
   * 
   * @returns Cache statistics
   */
  getStats(): CacheStats;

  /**
   * Sets cache configuration
   * 
   * @param config - Cache configuration
   */
  setConfig(config: CacheConfig): void;

  /**
   * Gets current cache configuration
   * 
   * @returns Current cache configuration
   */
  getConfig(): CacheConfig;

  /**
   * Gets all cache entries
   * 
   * @returns Array of cache entries
   */
  getEntries<T>(): CacheEntry<T>[];
}
