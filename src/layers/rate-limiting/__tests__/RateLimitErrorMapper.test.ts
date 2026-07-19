/**
 * Rate Limit Error Mapper Unit Tests
 */

import { RateLimitErrorMapper } from '../utils/RateLimitErrorMapper';
import { RateLimitError } from '../utils/RateLimitError';

describe('RateLimitErrorMapper', () => {
  it('should map rate limit exceeded to 429 with Retry-After header', () => {
    const error = RateLimitError.rateLimitExceeded('Too many requests', 5000);
    const mapped = RateLimitErrorMapper.map(error);
    expect(mapped.statusCode).toBe(429);
    expect(mapped.retryAfter).toBe(5000);
    expect(mapped.headers['Retry-After']).toBe('5');
  });

  it('should map invalid key to 400', () => {
    const error = RateLimitError.invalidKey('Bad key');
    const mapped = RateLimitErrorMapper.map(error);
    expect(mapped.statusCode).toBe(400);
    expect(mapped.headers['Retry-After']).toBeUndefined();
  });

  it('should map configuration error to 500', () => {
    const error = RateLimitError.configurationError('Bad config');
    const mapped = RateLimitErrorMapper.map(error);
    expect(mapped.statusCode).toBe(500);
  });

  it('should map generic Error to 500', () => {
    const error = new Error('Generic');
    const mapped = RateLimitErrorMapper.map(error);
    expect(mapped.statusCode).toBe(500);
    expect(mapped.code).toBe('INTERNAL_ERROR');
  });

  it('should extract headers from error', () => {
    const error = RateLimitError.rateLimitExceeded('Limited', 3000);
    const headers = RateLimitErrorMapper.toHeaders(error);
    expect(headers['Retry-After']).toBe('3');
  });
});
