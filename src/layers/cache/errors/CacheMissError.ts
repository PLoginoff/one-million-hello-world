/**
 * Cache Miss Error
 *
 * Thrown when a cache lookup fails to find an entry.
 *
 * @module CacheLayer/Errors
 */

import { CacheError, CacheErrorCode } from './CacheError';

/**
 * Error thrown when a cache key is not found
 */
export class CacheMissError extends CacheError {
  /** The key that was not found */
  readonly key: string;

  /**
   * Create a new CacheMissError
   *
   * @param key - The cache key that was not found
   * @param context - Additional context information
   */
  constructor(key: string, context: Record<string, unknown> = {}) {
    super(
      CacheErrorCode.CACHE_MISS,
      `Cache miss for key: ${key}`,
      { ...context, key },
      false // Cache misses are not retryable by default
    );
    this.name = 'CacheMissError';
    this.key = key;
  }

  /**
   * Create a CacheMissError with a custom message
   */
  static withMessage(key: string, message: string, context: Record<string, unknown> = {}): CacheMissError {
    const error = new CacheMissError(key, context);
    error.message = message;
    return error;
  }
}
