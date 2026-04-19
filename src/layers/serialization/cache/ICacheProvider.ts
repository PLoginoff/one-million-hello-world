/**
 * Cache Provider Interface
 * 
 * Defines the contract for cache providers.
 */

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  expiresAt?: Date;
  createdAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
}

export interface ICacheProvider<T = unknown> {
  /**
   * Gets a value from cache
   */
  get(key: string): T | undefined;

  /**
   * Sets a value in cache
   */
  set(key: string, value: T, ttl?: number): void;

  /**
   * Checks if a key exists in cache
   */
  has(key: string): boolean;

  /**
   * Deletes a key from cache
   */
  delete(key: string): boolean;

  /**
   * Clears all cache entries
   */
  clear(): void;

  /**
   * Gets the number of entries in cache
   */
  size(): number;

  /**
   * Gets all keys
   */
  keys(): string[];

  /**
   * Gets all entries
   */
  entries(): CacheEntry<T>[];

  /**
   * Removes expired entries
   */
  cleanup(): number;
}
