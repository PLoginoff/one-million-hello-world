/**
 * Circuit Breaker Unit Tests
 * 
 * Tests for CircuitBreaker implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { CircuitBreaker } from '../implementations/CircuitBreaker';
import { CircuitState } from '../types/circuit-breaker-types';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = circuitBreaker.getConfig();

      expect(config).toBeDefined();
      expect(config.failureThreshold).toBe(5);
      expect(config.successThreshold).toBe(2);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        failureThreshold: 3,
        successThreshold: 1,
        timeout: 30000,
        resetTimeout: 15000,
      };

      circuitBreaker.setConfig(newConfig);
      const config = circuitBreaker.getConfig();

      expect(config.failureThreshold).toBe(3);
      expect(config.successThreshold).toBe(1);
    });
  });

  describe('getState', () => {
    it('should return closed state initially', () => {
      const state = circuitBreaker.getState();

      expect(state).toBe(CircuitState.CLOSED);
    });
  });

  describe('execute', () => {
    it('should execute successful operation', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(operation);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(operation).toHaveBeenCalled();
    });

    it('should handle failed operation', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const result = await circuitBreaker.execute(operation);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Operation failed');
    });

    it('should use fallback on failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const fallback = jest.fn().mockResolvedValue('fallback');
      const result = await circuitBreaker.execute(operation, fallback);

      expect(result.success).toBe(true);
      expect(result.data).toBe('fallback');
      expect(fallback).toHaveBeenCalled();
    });

    it('should open circuit after threshold failures', async () => {
      circuitBreaker.setConfig({ failureThreshold: 3, successThreshold: 2, timeout: 60000, resetTimeout: 30000 });
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation);

      const state = circuitBreaker.getState();
      expect(state).toBe(CircuitState.OPEN);
    });

    it('should reject when circuit is open', async () => {
      circuitBreaker.setConfig({ failureThreshold: 2, successThreshold: 2, timeout: 60000, resetTimeout: 30000 });
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation);

      const result = await circuitBreaker.execute(operation);

      expect(result.success).toBe(false);
      expect(result.state).toBe(CircuitState.OPEN);
    });
  });

  describe('getStats', () => {
    it('should track statistics', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(operation);

      const stats = circuitBreaker.getStats();

      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset circuit to closed state', async () => {
      circuitBreaker.setConfig({ failureThreshold: 2, successThreshold: 2, timeout: 60000, resetTimeout: 30000 });
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation);
      circuitBreaker.reset();

      const state = circuitBreaker.getState();
      expect(state).toBe(CircuitState.CLOSED);
    });
  });
});
