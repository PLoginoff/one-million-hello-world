/**
 * Cache Error Classes
 *
 * Domain-specific error hierarchy for cache layer.
 */

export class CacheError extends Error {
  override readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'CacheError';
    this.cause = cause;
  }
}

export class CacheKeyError extends CacheError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'CacheKeyError';
  }
}

export class CacheConfigError extends CacheError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'CacheConfigError';
  }
}

export class CacheStorageError extends CacheError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'CacheStorageError';
  }
}

export class CacheEvictionError extends CacheError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'CacheEvictionError';
  }
}
