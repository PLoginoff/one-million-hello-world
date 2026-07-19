/**
 * Service Error Mapper Unit Tests
 */

import { ServiceErrorMapper } from '../utils/ServiceErrorMapper';
import { ServiceError } from '../utils/ServiceError';

describe('ServiceErrorMapper', () => {
  it('should map ServiceError.executionFailed as retryable', () => {
    const error = ServiceError.executionFailed('Execution failed', 'svc-1');
    const mapped = ServiceErrorMapper.map(error);

    expect(mapped.code).toBe('SERVICE_EXECUTION_FAILED');
    expect(mapped.retryable).toBe(true);
    expect(mapped.details).toEqual({ serviceId: 'svc-1' });
  });

  it('should map ServiceError.notFound as non-retryable', () => {
    const error = ServiceError.notFound('Not found', 'svc-1');
    const mapped = ServiceErrorMapper.map(error);

    expect(mapped.code).toBe('SERVICE_NOT_FOUND');
    expect(mapped.retryable).toBe(false);
  });

  it('should map generic Error as non-retryable internal error', () => {
    const error = new Error('Something went wrong');
    const mapped = ServiceErrorMapper.map(error);

    expect(mapped.code).toBe('INTERNAL_ERROR');
    expect(mapped.retryable).toBe(false);
    expect(mapped.message).toBe('Something went wrong');
  });

  it('should map generic Error with empty message to default', () => {
    const error = new Error('');
    const mapped = ServiceErrorMapper.map(error);

    expect(mapped.message).toBe('An unexpected error occurred');
  });

  it('should convert to ServiceResult', () => {
    const error = ServiceError.notFound('Not found', 'svc-1');
    const result = ServiceErrorMapper.toServiceResult<string>(error);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('SERVICE_NOT_FOUND');
  });

  it('should check retryability', () => {
    const retryable = ServiceError.executionFailed('Failed', 'svc-1');
    const nonRetryable = ServiceError.notFound('Not found', 'svc-1');

    expect(ServiceErrorMapper.isRetryable(retryable)).toBe(true);
    expect(ServiceErrorMapper.isRetryable(nonRetryable)).toBe(false);
  });

  it('should support custom retryable code registration', () => {
    ServiceErrorMapper.registerRetryableCode('CUSTOM_RETRYABLE');
    const error = new ServiceError('CUSTOM_RETRYABLE', 'Custom error');
    expect(ServiceErrorMapper.isRetryable(error)).toBe(true);
  });
});
