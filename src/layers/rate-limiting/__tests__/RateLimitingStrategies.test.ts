/**
 * Strategy tests for RateLimiting layer
 */

import { RateLimitingDefaultStrategy } from '../strategies/DefaultStrategy';
import { RateLimitingFastStrategy } from '../strategies/FastStrategy';
import { RateLimitingReliableStrategy } from '../strategies/ReliableStrategy';
import { RateLimitingCachedStrategy } from '../strategies/CachedStrategy';
import { RateLimitingBatchStrategy } from '../strategies/BatchStrategy';
import { RateLimitingStrategyFactory } from '../factories/RateLimitingStrategyFactory';

describe('RateLimiting Strategies', () => {
  const strategies = [
    { name: 'default', cls: RateLimitingDefaultStrategy },
    { name: 'fast', cls: RateLimitingFastStrategy },
    { name: 'reliable', cls: RateLimitingReliableStrategy },
    { name: 'cached', cls: RateLimitingCachedStrategy },
    { name: 'batch', cls: RateLimitingBatchStrategy },
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

  describe('RateLimitingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new RateLimitingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new RateLimitingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new RateLimitingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new RateLimitingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new RateLimitingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
