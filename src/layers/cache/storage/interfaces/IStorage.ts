/**
 * Storage Interface
 * 
 * Defines contract for cache storage backend.
 */

import { CacheEntry } from '../../domain/entities/CacheEntry';

export interface IStorage<T> {
  /**
   * Get entry by key
   */
  get(key: string): CacheEntry<T> | undefined;

  /**
   * Set entry
   */
  set(key: string, entry: CacheEntry<T>): void;

  /**
   * Delete entry by key
   */
  delete(key: string): boolean;

  /**
   * Check if key exists
   */
  has(key: string): boolean;

  /**
   * Get all keys
   */
  keys(): string[];

  /**
   * Get all entries
   */
  entries(): CacheEntry<T>[];

  /**
   * Get storage size
   */
  size(): number;

  /**
   * Clear all entries
   */
  clear(): void;

  /**
   * Get storage type
   */
  getType(): string;
}
