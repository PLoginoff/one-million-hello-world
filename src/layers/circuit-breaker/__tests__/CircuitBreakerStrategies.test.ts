/**
 * Strategy tests for CircuitBreaker layer
 */

import { CircuitBreakerDefaultStrategy } from '../strategies/DefaultStrategy';
import { CircuitBreakerFastStrategy } from '../strategies/FastStrategy';
import { CircuitBreakerReliableStrategy } from '../strategies/ReliableStrategy';
import { CircuitBreakerCachedStrategy } from '../strategies/CachedStrategy';
import { CircuitBreakerBatchStrategy } from '../strategies/BatchStrategy';
import { CircuitBreakerStrategyFactory } from '../factories/CircuitBreakerStrategyFactory';

describe('CircuitBreaker Strategies', () => {
  const strategies = [
    { name: 'default', cls: CircuitBreakerDefaultStrategy },
    { name: 'fast', cls: CircuitBreakerFastStrategy },
    { name: 'reliable', cls: CircuitBreakerReliableStrategy },
    { name: 'cached', cls: CircuitBreakerCachedStrategy },
    { name: 'batch', cls: CircuitBreakerBatchStrategy },
  ];

  strategies.forEach((s) => {
    describe(s.name + ' strategy', () => {
      it('should have correct name', () => {
        const strategy = new s.cls();
        expect(strategy.name).toBe(s.name);
      });

      it('should have positive priority', () => {
        const strategy = new s.cls();
        expect(strategy.priority).toBeGreaterThanOrEqual(0);
      });

      it('should execute successfully', async () => {
        const strategy = new s.cls();
        const result = await strategy.execute('test');
        expect(result.success).toBe(true);
      });

      it('should track execution count', async () => {
        const strategy = new s.cls();
        await strategy.execute(1);
        await strategy.execute(2);
        await strategy.execute(3);
        expect(strategy.getExecutionCount()).toBe(3);
      });
    });
  });

  describe('CircuitBreakerStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new CircuitBreakerStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new CircuitBreakerStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new CircuitBreakerStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new CircuitBreakerStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new CircuitBreakerStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
