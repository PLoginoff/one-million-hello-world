/**
 * Security Error Mapper Unit Tests
 */

import { SecurityErrorMapper } from '../utils/SecurityErrorMapper';
import { SecurityError } from '../utils/SecurityError';

describe('SecurityErrorMapper', () => {
  it('should map authentication failed to 401', () => {
    const error = SecurityError.authenticationFailed('Bad credentials');
    const mapped = SecurityErrorMapper.map(error);
    expect(mapped.statusCode).toBe(401);
    expect(mapped.code).toBe('AUTH_FAILED');
    expect(mapped.retryable).toBe(false);
  });

  it('should map authorization failed to 403', () => {
    const error = SecurityError.authorizationFailed('Forbidden');
    const mapped = SecurityErrorMapper.map(error);
    expect(mapped.statusCode).toBe(403);
  });

  it('should map invalid token to 401', () => {
    const error = SecurityError.invalidToken('Expired');
    const mapped = SecurityErrorMapper.map(error);
    expect(mapped.statusCode).toBe(401);
  });

  it('should map generic Error to 500', () => {
    const error = new Error('Generic');
    const mapped = SecurityErrorMapper.map(error);
    expect(mapped.statusCode).toBe(500);
    expect(mapped.code).toBe('INTERNAL_ERROR');
  });

  it('should check retryability', () => {
    expect(SecurityErrorMapper.isRetryable(SecurityError.authenticationFailed())).toBe(false);
  });

  it('should support custom retryable code', () => {
    SecurityErrorMapper.registerRetryableCode('CUSTOM_RETRY');
    const error = new SecurityError('CUSTOM_RETRY', 'Custom', 429);
    expect(SecurityErrorMapper.isRetryable(error)).toBe(true);
  });
});
