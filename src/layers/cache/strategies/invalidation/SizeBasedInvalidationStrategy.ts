/**
 * Size-Based Invalidation Strategy
 * 
 * Invalidates entries when cache size exceeds limit.
 * This works in conjunction with eviction strategies.
 */

import { IInvalidationStrategy } from './IInvalidationStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';

export class SizeBasedInvalidationStrategy<T> implements IInvalidationStrategy<T> {
  private maxSize: number;
  private currentSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.currentSize = 0;
  }

  shouldInvalidate(entry: CacheEntry<T>, currentTime: number): boolean {
    // This strategy is used by the cache manager, not per-entry
    return false;
  }

  /**
   * Check if cache needs eviction
   */
  needsEviction(): boolean {
    return this.currentSize >= this.maxSize;
  }

  /**
   * Update current size
   */
  updateSize(size: number): void {
    this.currentSize = size;
  }

  /**
   * Set max size
   */
  setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
  }

  getName(): string {
    return 'SIZE_BASED';
  }
}
