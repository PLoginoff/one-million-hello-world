/**
 * Invalidation Strategy Interface
 * 
 * Defines contract for cache invalidation strategies.
 */

import { CacheEntry } from '../../domain/entities/CacheEntry';

export interface IInvalidationStrategy<T> {
  /**
   * Check if entry should be invalidated
   * 
   * @param entry - Cache entry to check
   * @param currentTime - Current timestamp
   * @returns True if entry should be invalidated
   */
  shouldInvalidate(entry: CacheEntry<T>, currentTime: number): boolean;

  /**
   * Get strategy name
   */
  getName(): string;
}
