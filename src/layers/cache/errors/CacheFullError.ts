/**
 * Cache Full Error
 *
 * Thrown when the cache has reached its capacity limit.
 *
 * @module CacheLayer/Errors
 */

import { CacheError, CacheErrorCode } from './CacheError';

/**
 * Error thrown when cache is at capacity
 */
export class CacheFullError extends CacheError {
  /** Current cache size */
  readonly currentSize: number;
  /** Maximum cache capacity */
  readonly maxSize: number;

  /**
   * Create a new CacheFullError
   *
   * @param currentSize - Current number of entries in cache
   * @param maxSize - Maximum cache capacity
   * @param context - Additional context information
   */
  constructor(currentSize: number, maxSize: number, context: Record<string, unknown> = {}) {
    super(
      CacheErrorCode.CACHE_FULL,
      `Cache is full: ${currentSize}/${maxSize} entries`,
      { ...context, currentSize, maxSize, utilizationPercent: Math.round((currentSize / maxSize) * 100) },
      true // Cache full errors may be retryable after eviction
    );
    this.name = 'CacheFullError';
    this.currentSize = currentSize;
    this.maxSize = maxSize;
  }
}
