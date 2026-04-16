/**
 * Eviction Strategy Interface
 * 
 * Defines contract for cache entry eviction strategies.
 */

import { CacheEntry } from '../../domain/entities/CacheEntry';

export interface IEvictionStrategy<T> {
  /**
   * Select entry to evict from cache
   * 
   * @param entries - Map of cache entries
   * @returns Key of entry to evict, or null if no entry should be evicted
   */
  selectEntryToEvict(entries: Map<string, CacheEntry<T>>): string | null;

  /**
   * Notify strategy when entry is accessed
   * 
   * @param key - Cache key
   * @param entry - Cache entry
   */
  onAccess(key: string, entry: CacheEntry<T>): void;

  /**
   * Notify strategy when entry is added
   * 
   * @param key - Cache key
   * @param entry - Cache entry
   */
  onAdd(key: string, entry: CacheEntry<T>): void;

  /**
   * Reset strategy state
   */
  reset(): void;

  /**
   * Get strategy name
   */
  getName(): string;
}
