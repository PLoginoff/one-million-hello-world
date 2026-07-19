/**
 * Repository Error Mapper Unit Tests
 */

import { RepositoryErrorMapper } from '../utils/RepositoryErrorMapper';
import { RepositoryError } from '../utils/RepositoryError';

describe('RepositoryErrorMapper', () => {
  it('should map RepositoryError.queryFailed as retryable', () => {
    const error = RepositoryError.queryFailed('Query failed', 'repo-1');
    const mapped = RepositoryErrorMapper.map(error);
    expect(mapped.code).toBe('QUERY_FAILED');
    expect(mapped.retryable).toBe(true);
    expect(mapped.details).toEqual({ repositoryId: 'repo-1' });
  });

  it('should map RepositoryError.notFound as non-retryable', () => {
    const error = RepositoryError.notFound('Not found', 'repo-1');
    const mapped = RepositoryErrorMapper.map(error);
    expect(mapped.retryable).toBe(false);
  });

  it('should map generic Error as internal non-retryable', () => {
    const error = new Error('Something broke');
    const mapped = RepositoryErrorMapper.map(error);
    expect(mapped.code).toBe('INTERNAL_ERROR');
    expect(mapped.retryable).toBe(false);
  });

  it('should convert to RepositoryResult', () => {
    const error = RepositoryError.notFound('Not found', 'repo-1');
    const result = RepositoryErrorMapper.toRepositoryResult<string>(error);
    expect(result.success).toBe(false);
    expect(result.error!.code).toBe('REPOSITORY_NOT_FOUND');
  });

  it('should check retryability', () => {
    expect(RepositoryErrorMapper.isRetryable(RepositoryError.queryFailed())).toBe(true);
    expect(RepositoryErrorMapper.isRetryable(RepositoryError.notFound())).toBe(false);
  });

  it('should support custom retryable code', () => {
    RepositoryErrorMapper.registerRetryableCode('CUSTOM');
    const error = new RepositoryError('CUSTOM', 'Custom error');
    expect(RepositoryErrorMapper.isRetryable(error)).toBe(true);
  });
});
