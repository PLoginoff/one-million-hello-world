/**
 * Strategy tests for Middleware layer
 */

import { MiddlewareDefaultStrategy } from '../strategies/DefaultStrategy';
import { MiddlewareFastStrategy } from '../strategies/FastStrategy';
import { MiddlewareReliableStrategy } from '../strategies/ReliableStrategy';
import { MiddlewareCachedStrategy } from '../strategies/CachedStrategy';
import { MiddlewareBatchStrategy } from '../strategies/BatchStrategy';
import { MiddlewareStrategyFactory } from '../factories/MiddlewareStrategyFactory';

describe('Middleware Strategies', () => {
  const strategies = [
    { name: 'default', cls: MiddlewareDefaultStrategy },
    { name: 'fast', cls: MiddlewareFastStrategy },
    { name: 'reliable', cls: MiddlewareReliableStrategy },
    { name: 'cached', cls: MiddlewareCachedStrategy },
    { name: 'batch', cls: MiddlewareBatchStrategy },
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

  describe('MiddlewareStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new MiddlewareStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new MiddlewareStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new MiddlewareStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new MiddlewareStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new MiddlewareStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
