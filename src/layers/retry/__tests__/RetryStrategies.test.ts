/**
 * Strategy tests for Retry layer
 */

import { RetryDefaultStrategy } from '../strategies/DefaultStrategy';
import { RetryFastStrategy } from '../strategies/FastStrategy';
import { RetryReliableStrategy } from '../strategies/ReliableStrategy';
import { RetryCachedStrategy } from '../strategies/CachedStrategy';
import { RetryBatchStrategy } from '../strategies/BatchStrategy';
import { RetryStrategyFactory } from '../factories/RetryStrategyFactory';

describe('Retry Strategies', () => {
  const strategies = [
    { name: 'default', cls: RetryDefaultStrategy },
    { name: 'fast', cls: RetryFastStrategy },
    { name: 'reliable', cls: RetryReliableStrategy },
    { name: 'cached', cls: RetryCachedStrategy },
    { name: 'batch', cls: RetryBatchStrategy },
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

  describe('RetryStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new RetryStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new RetryStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new RetryStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new RetryStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new RetryStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
