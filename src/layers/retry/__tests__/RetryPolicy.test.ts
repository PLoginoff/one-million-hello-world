/**
 * Retry Policy Unit Tests
 * 
 * Tests for RetryPolicy implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { RetryPolicy } from '../implementations/RetryPolicy';
import { RetryStrategy } from '../types/retry-types';

describe('RetryPolicy', () => {
  let retryPolicy: RetryPolicy;

  beforeEach(() => {
    retryPolicy = new RetryPolicy();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = retryPolicy.getConfig();

      expect(config).toBeDefined();
      expect(config.maxAttempts).toBe(3);
      expect(config.strategy).toBe(RetryStrategy.EXPONENTIAL_BACKOFF);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        maxAttempts: 5,
        strategy: RetryStrategy.LINEAR_BACKOFF,
        baseDelay: 500,
        maxDelay: 5000,
        jitter: false,
      };

      retryPolicy.setConfig(newConfig);
      const config = retryPolicy.getConfig();

      expect(config.maxAttempts).toBe(5);
      expect(config.strategy).toBe(RetryStrategy.LINEAR_BACKOFF);
    });
  });

  describe('execute', () => {
    it('should execute successful operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await retryPolicy.execute(operation);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
    });

    it('should retry on failure', async () => {
      retryPolicy.setConfig({ maxAttempts: 3, strategy: RetryStrategy.FIXED_DELAY, baseDelay: 10, maxDelay: 100, jitter: false });
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success');

      const result = await retryPolicy.execute(operation);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts', async () => {
      retryPolicy.setConfig({ maxAttempts: 2, strategy: RetryStrategy.FIXED_DELAY, baseDelay: 10, maxDelay: 100, jitter: false });
      const operation = jest.fn().mockRejectedValue(new Error('Failed'));

      const result = await retryPolicy.execute(operation);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2);
      expect(result.error).toBe('Failed');
    });
  });
});
