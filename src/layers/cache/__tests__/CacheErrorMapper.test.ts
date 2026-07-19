/**
 * Cache Error Mapper Unit Tests
 */

import { CacheErrorMapper } from '../utils/errors/CacheErrorMapper';
import { CacheError, CacheKeyError, CacheConfigError } from '../utils/errors/CacheError';

describe('CacheErrorMapper', () => {
  it('should map CacheKeyError as warning and retryable', () => {
    const error = new CacheKeyError('Bad key');
    const mapped = CacheErrorMapper.map(error);
    expect(mapped.name).toBe('CacheKeyError');
    expect(mapped.severity).toBe('warning');
    expect(mapped.retryable).toBe(true);
  });

  it('should map CacheConfigError as critical and non-retryable', () => {
    const error = new CacheConfigError('Bad config');
    const mapped = CacheErrorMapper.map(error);
    expect(mapped.severity).toBe('critical');
    expect(mapped.retryable).toBe(false);
  });

  it('should map generic CacheError as error and retryable', () => {
    const error = new CacheError('Something went wrong');
    const mapped = CacheErrorMapper.map(error);
    expect(mapped.severity).toBe('error');
    expect(mapped.retryable).toBe(true);
  });

  it('should map generic Error as internal non-retryable', () => {
    const error = new Error('Generic');
    const mapped = CacheErrorMapper.map(error);
    expect(mapped.name).toBe('InternalError');
    expect(mapped.retryable).toBe(false);
  });

  it('should check retryability', () => {
    expect(CacheErrorMapper.isRetryable(new CacheKeyError('key'))).toBe(true);
    expect(CacheErrorMapper.isRetryable(new CacheConfigError('config'))).toBe(false);
  });
});
