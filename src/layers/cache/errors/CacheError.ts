/**
 * Cache Error Base Class
 *
 * Base error class for all cache-related errors.
 * Provides structured error information with error codes and context.
 *
 * @module CacheLayer/Errors
 */

/**
 * Standard cache error codes
 */
export enum CacheErrorCode {
  /** Cache entry not found */
  CACHE_MISS = 'CACHE_MISS',
  /** Cache is at capacity and cannot accept new entries */
  CACHE_FULL = 'CACHE_FULL',
  /** Serialization/deserialization failed */
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
  /** Deserialization failed */
  DESERIALIZATION_ERROR = 'DESERIALIZATION_ERROR',
  /** Invalid cache key */
  INVALID_KEY = 'INVALID_KEY',
  /** Invalid cache configuration */
  INVALID_CONFIG = 'INVALID_CONFIG',
  /** Storage backend error */
  STORAGE_ERROR = 'STORAGE_ERROR',
  /** Connection error (e.g., Redis) */
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  /** Operation timeout */
  TIMEOUT = 'TIMEOUT',
  /** Operation not supported */
  NOT_SUPPORTED = 'NOT_SUPPORTED',
  /** Cache entry expired */
  ENTRY_EXPIRED = 'ENTRY_EXPIRED',
  /** Eviction failed */
  EVICTION_FAILED = 'EVICTION_FAILED',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Base cache error class
 */
export class CacheError extends Error {
  /** Error code for programmatic handling */
  readonly code: CacheErrorCode;
  /** Additional context about the error */
  readonly context: Record<string, unknown>;
  /** Timestamp when the error occurred */
  readonly timestamp: number;
  /** Whether this error is retryable */
  readonly retryable: boolean;

  /**
   * Create a new CacheError
   *
   * @param code - Error code
   * @param message - Human-readable error message
   * @param context - Additional context information
   * @param retryable - Whether the operation can be retried
   */
  constructor(
    code: CacheErrorCode,
    message: string,
    context: Record<string, unknown> = {},
    retryable: boolean = false
  ) {
    super(message);
    this.name = 'CacheError';
    this.code = code;
    this.context = context;
    this.timestamp = Date.now();
    this.retryable = retryable;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CacheError);
    }
  }

  /**
   * Create a CacheError from an unknown error
   */
  static fromUnknown(error: unknown, context: Record<string, unknown> = {}): CacheError {
    if (error instanceof CacheError) {
      return error;
    }
    if (error instanceof Error) {
      return new CacheError(
        CacheErrorCode.UNKNOWN,
        error.message,
        { ...context, originalError: error.name, stack: error.stack },
        false
      );
    }
    return new CacheError(CacheErrorCode.UNKNOWN, String(error), { ...context, originalError: String(error) }, false);
  }

  /**
   * Convert to a plain object for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      retryable: this.retryable,
      stack: this.stack,
    };
  }
}
