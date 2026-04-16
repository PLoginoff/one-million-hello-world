/**
 * Cache Error
 * 
 * Base error class for cache-related errors.
 */

export class CacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CacheError';
    Object.setPrototypeOf(this, CacheError.prototype);
  }
}

export class CacheKeyError extends CacheError {
  constructor(message: string) {
    super(message);
    this.name = 'CacheKeyError';
    Object.setPrototypeOf(this, CacheKeyError.prototype);
  }
}

export class CacheConfigError extends CacheError {
  constructor(message: string) {
    super(message);
    this.name = 'CacheConfigError';
    Object.setPrototypeOf(this, CacheConfigError.prototype);
  }
}

export class CacheStorageError extends CacheError {
  constructor(message: string) {
    super(message);
    this.name = 'CacheStorageError';
    Object.setPrototypeOf(this, CacheStorageError.prototype);
  }
}

export class CacheEvictionError extends CacheError {
  constructor(message: string) {
    super(message);
    this.name = 'CacheEvictionError';
    Object.setPrototypeOf(this, CacheEvictionError.prototype);
  }
}
