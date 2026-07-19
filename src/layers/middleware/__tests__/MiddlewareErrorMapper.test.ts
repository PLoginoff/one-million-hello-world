/**
 * Middleware Error Mapper Unit Tests
 */

import { MiddlewareErrorMapper } from '../utils/MiddlewareErrorMapper';
import { MiddlewareError } from '../utils/MiddlewareError';

describe('MiddlewareErrorMapper', () => {
  it('should map EXECUTION_FAILED as retryable', () => {
    const error = MiddlewareError.executionFailed('Failed', 'mw-1');
    const mapped = MiddlewareErrorMapper.map(error);
    expect(mapped.code).toBe('EXECUTION_FAILED');
    expect(mapped.retryable).toBe(true);
    expect(mapped.middlewareId).toBe('mw-1');
  });

  it('should map TIMEOUT as retryable', () => {
    const error = MiddlewareError.timeout('Timed out', 'mw-1');
    const mapped = MiddlewareErrorMapper.map(error);
    expect(mapped.retryable).toBe(true);
  });

  it('should map CONFIGURATION_ERROR as non-retryable', () => {
    const error = MiddlewareError.configuration('Bad config', 'mw-1');
    const mapped = MiddlewareErrorMapper.map(error);
    expect(mapped.retryable).toBe(false);
  });

  it('should map generic Error as internal non-retryable', () => {
    const error = new Error('Generic');
    const mapped = MiddlewareErrorMapper.map(error);
    expect(mapped.code).toBe('INTERNAL_ERROR');
    expect(mapped.retryable).toBe(false);
  });

  it('should check retryability', () => {
    expect(MiddlewareErrorMapper.isRetryable(MiddlewareError.timeout())).toBe(true);
    expect(MiddlewareErrorMapper.isRetryable(MiddlewareError.configuration())).toBe(false);
  });

  it('should support custom retryable code', () => {
    MiddlewareErrorMapper.registerRetryableCode('CUSTOM');
    const error = new MiddlewareError('CUSTOM', 'Custom');
    expect(MiddlewareErrorMapper.isRetryable(error)).toBe(true);
  });
});
