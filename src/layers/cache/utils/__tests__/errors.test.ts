/**
 * Cache Error Classes Unit Tests
 * 
 * Tests for error classes using AAA pattern.
 */

import {
  CacheError,
  CacheKeyError,
  CacheConfigError,
  CacheStorageError,
  CacheEvictionError,
} from '../errors/errors';

describe('CacheError', () => {
  it('should create error with message', () => {
    const error = new CacheError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('CacheError');
  });

  it('should be instance of Error', () => {
    const error = new CacheError('Test error');
    expect(error).toBeInstanceOf(Error);
  });

  it('should support error chaining', () => {
    const cause = new Error('Cause');
    const error = new CacheError('Test error', cause);
    expect(error.cause).toBe(cause);
  });
});

describe('CacheKeyError', () => {
  it('should create error with message', () => {
    const error = new CacheKeyError('Invalid key');
    expect(error.message).toBe('Invalid key');
    expect(error.name).toBe('CacheKeyError');
  });

  it('should be instance of CacheError', () => {
    const error = new CacheKeyError('Invalid key');
    expect(error).toBeInstanceOf(CacheError);
  });

  it('should be instance of Error', () => {
    const error = new CacheKeyError('Invalid key');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('CacheConfigError', () => {
  it('should create error with message', () => {
    const error = new CacheConfigError('Invalid config');
    expect(error.message).toBe('Invalid config');
    expect(error.name).toBe('CacheConfigError');
  });

  it('should be instance of CacheError', () => {
    const error = new CacheConfigError('Invalid config');
    expect(error).toBeInstanceOf(CacheError);
  });

  it('should be instance of Error', () => {
    const error = new CacheConfigError('Invalid config');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('CacheStorageError', () => {
  it('should create error with message', () => {
    const error = new CacheStorageError('Storage error');
    expect(error.message).toBe('Storage error');
    expect(error.name).toBe('CacheStorageError');
  });

  it('should be instance of CacheError', () => {
    const error = new CacheStorageError('Storage error');
    expect(error).toBeInstanceOf(CacheError);
  });

  it('should be instance of Error', () => {
    const error = new CacheStorageError('Storage error');
    expect(error).toBeInstanceOf(Error);
  });

  it('should support error chaining', () => {
    const cause = new Error('IO Error');
    const error = new CacheStorageError('Storage error', cause);
    expect(error.cause).toBe(cause);
  });
});

describe('CacheEvictionError', () => {
  it('should create error with message', () => {
    const error = new CacheEvictionError('Eviction error');
    expect(error.message).toBe('Eviction error');
    expect(error.name).toBe('CacheEvictionError');
  });

  it('should be instance of CacheError', () => {
    const error = new CacheEvictionError('Eviction error');
    expect(error).toBeInstanceOf(CacheError);
  });

  it('should be instance of Error', () => {
    const error = new CacheEvictionError('Eviction error');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('Error Hierarchy', () => {
  it('should maintain proper inheritance chain', () => {
    const keyError = new CacheKeyError('key error');
    const configError = new CacheConfigError('config error');
    const storageError = new CacheStorageError('storage error');
    const evictionError = new CacheEvictionError('eviction error');

    expect(keyError).toBeInstanceOf(CacheError);
    expect(configError).toBeInstanceOf(CacheError);
    expect(storageError).toBeInstanceOf(CacheError);
    expect(evictionError).toBeInstanceOf(CacheError);
  });

  it('should all be instances of Error', () => {
    const keyError = new CacheKeyError('key error');
    const configError = new CacheConfigError('config error');
    const storageError = new CacheStorageError('storage error');
    const evictionError = new CacheEvictionError('eviction error');

    expect(keyError).toBeInstanceOf(Error);
    expect(configError).toBeInstanceOf(Error);
    expect(storageError).toBeInstanceOf(Error);
    expect(evictionError).toBeInstanceOf(Error);
  });
});
