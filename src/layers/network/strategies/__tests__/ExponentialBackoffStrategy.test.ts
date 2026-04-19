/**
 * Exponential Backoff Strategy Tests
 * 
 * Unit tests for ExponentialBackoffStrategy using AAA pattern.
 */

import { ExponentialBackoffStrategy } from '../reconnection/ExponentialBackoffStrategy';

describe('ExponentialBackoffStrategy', () => {
  describe('getNextDelay', () => {
    it('should return initial delay on first attempt', () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelay: 1000,
        backoffMultiplier: 2,
      });
      
      const delay = strategy.getNextDelay();
      
      expect(delay).toBe(1000);
    });

    it('should increase delay exponentially', () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelay: 1000,
        backoffMultiplier: 2,
      });
      
      const delay1 = strategy.getNextDelay();
      const delay2 = strategy.getNextDelay();
      const delay3 = strategy.getNextDelay();
      
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should respect max delay', () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelay: 1000,
        maxDelay: 3000,
        backoffMultiplier: 10,
      });
      
      const delay1 = strategy.getNextDelay();
      const delay2 = strategy.getNextDelay();
      
      expect(delay2).toBeLessThanOrEqual(3000);
    });

    it('should return -1 when max retries exceeded', () => {
      const strategy = new ExponentialBackoffStrategy({
        maxRetries: 2,
        initialDelay: 1000,
      });
      
      strategy.getNextDelay();
      strategy.getNextDelay();
      const delay = strategy.getNextDelay();
      
      expect(delay).toBe(-1);
    });
  });

  describe('shouldAttempt', () => {
    it('should return true when retries available', () => {
      const strategy = new ExponentialBackoffStrategy({
        maxRetries: 5,
      });
      
      expect(strategy.shouldAttempt()).toBe(true);
    });

    it('should return false when max retries exceeded', () => {
      const strategy = new ExponentialBackoffStrategy({
        maxRetries: 1,
      });
      
      strategy.getNextDelay();
      strategy.getNextDelay();
      
      expect(strategy.shouldAttempt()).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset attempt counter', () => {
      const strategy = new ExponentialBackoffStrategy({
        maxRetries: 5,
      });
      
      strategy.getNextDelay();
      strategy.getNextDelay();
      strategy.reset();
      
      expect(strategy.getAttemptCount()).toBe(0);
      expect(strategy.shouldAttempt()).toBe(true);
    });
  });

  describe('getAttemptCount', () => {
    it('should return current attempt count', () => {
      const strategy = new ExponentialBackoffStrategy();
      
      expect(strategy.getAttemptCount()).toBe(0);
      
      strategy.getNextDelay();
      expect(strategy.getAttemptCount()).toBe(1);
      
      strategy.getNextDelay();
      expect(strategy.getAttemptCount()).toBe(2);
    });
  });

  describe('jitter', () => {
    it('should add jitter when enabled', () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelay: 1000,
        jitter: true,
      });
      
      const delay1 = strategy.getNextDelay();
      const delay2 = strategy.getNextDelay();
      
      expect(delay2).not.toBe(delay1 * 2);
    });

    it('should not add jitter when disabled', () => {
      const strategy = new ExponentialBackoffStrategy({
        initialDelay: 1000,
        jitter: false,
      });
      
      const delay1 = strategy.getNextDelay();
      const delay2 = strategy.getNextDelay();
      
      expect(delay2).toBe(2000);
    });
  });
});
