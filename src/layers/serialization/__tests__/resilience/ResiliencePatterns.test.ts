/**
 * Resilience Patterns Tests
 */

import { CircuitBreaker, CircuitState } from '../../resilience/CircuitBreaker';
import { RetryPolicy } from '../../resilience/RetryPolicy';
import { RateLimiter, RateLimitStrategy } from '../../resilience/RateLimiter';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 1000,
    });
  });

  describe('State Management', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open after threshold failures', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should transition to half-open after timeout', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }
      await new Promise(resolve => setTimeout(resolve, 1100));
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should close after successful attempts', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }
      await new Promise(resolve => setTimeout(resolve, 1100));
      await breaker.execute(async () => 'success');
      await breaker.execute(async () => 'success');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('Execution', () => {
    it('should execute successfully when closed', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should throw when open', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }
      await expect(breaker.execute(async () => 'success')).rejects.toThrow();
    });

    it('should execute sync function', () => {
      const result = breaker.executeSync(() => 'success');
      expect(result).toBe('success');
    });
  });

  describe('Reset', () => {
    it('should reset circuit breaker', () => {
      breaker.reset();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getFailureCount()).toBe(0);
    });
  });
});

describe('RetryPolicy', () => {
  let policy: RetryPolicy;

  beforeEach(() => {
    policy = new RetryPolicy({
      maxAttempts: 3,
      initialDelay: 10,
      backoffMultiplier: 2,
    });
  });

  describe('Retry Logic', () => {
    it('should succeed on first attempt', async () => {
      const result = await policy.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const result = await policy.execute(async () => {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return 'success';
      });
      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should fail after max attempts', async () => {
      await expect(policy.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
    });

    it('should not retry non-retryable errors', async () => {
      policy.updateConfig({
        retryableErrors: () => false,
      });
      await expect(policy.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow();
    });
  });

  describe('Sync Execution', () => {
    it('should execute sync function with retry', () => {
      let attempts = 0;
      const result = policy.executeSync(() => {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return 'success';
      });
      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });
  });

  describe('Delay Calculation', () => {
    it('should calculate exponential backoff', () => {
      expect(policy.calculateDelay(1)).toBe(10);
      expect(policy.calculateDelay(2)).toBe(20);
      expect(policy.calculateDelay(3)).toBe(40);
    });

    it('should respect max delay', () => {
      policy.updateConfig({ maxDelay: 25 });
      expect(policy.calculateDelay(3)).toBe(25);
    });
  });
});

describe('RateLimiter', () => {
  describe('Token Bucket', () => {
    it('should allow requests within limit', async () => {
      const limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
        strategy: RateLimitStrategy.TOKEN_BUCKET,
      });
      for (let i = 0; i < 5; i++) {
        expect(await limiter.allow()).toBe(true);
      }
    });

    it('should deny requests over limit', async () => {
      const limiter = new RateLimiter({
        maxRequests: 2,
        windowMs: 1000,
        strategy: RateLimitStrategy.TOKEN_BUCKET,
      });
      await limiter.allow();
      await limiter.allow();
      expect(await limiter.allow()).toBe(false);
    });
  });

  describe('Fixed Window', () => {
    it('should allow requests within window', async () => {
      const limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
        strategy: RateLimitStrategy.FIXED_WINDOW,
      });
      for (let i = 0; i < 5; i++) {
        expect(await limiter.allow()).toBe(true);
      }
    });
  });

  describe('Statistics', () => {
    it('should return remaining requests', async () => {
      const limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });
      await limiter.allow();
      await limiter.allow();
      expect(limiter.getRemainingRequests()).toBe(3);
    });

    it('should return used requests', async () => {
      const limiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 1000,
      });
      await limiter.allow();
      await limiter.allow();
      expect(limiter.getUsedRequests()).toBe(2);
    });
  });

  describe('Reset', () => {
    it('should reset limiter', () => {
      const limiter = new RateLimiter({ maxRequests: 5 });
      limiter.allowSync();
      limiter.reset();
      expect(limiter.getUsedRequests()).toBe(0);
    });
  });
});
