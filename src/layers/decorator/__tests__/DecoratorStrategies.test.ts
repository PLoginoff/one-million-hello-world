/**
 * Strategy tests for Decorator layer
 */

import { DecoratorDefaultStrategy } from '../strategies/DefaultStrategy';
import { DecoratorFastStrategy } from '../strategies/FastStrategy';
import { DecoratorReliableStrategy } from '../strategies/ReliableStrategy';
import { DecoratorCachedStrategy } from '../strategies/CachedStrategy';
import { DecoratorBatchStrategy } from '../strategies/BatchStrategy';
import { DecoratorStrategyFactory } from '../factories/DecoratorStrategyFactory';

describe('Decorator Strategies', () => {
  const strategies = [
    { name: 'default', cls: DecoratorDefaultStrategy },
    { name: 'fast', cls: DecoratorFastStrategy },
    { name: 'reliable', cls: DecoratorReliableStrategy },
    { name: 'cached', cls: DecoratorCachedStrategy },
    { name: 'batch', cls: DecoratorBatchStrategy },
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

  describe('DecoratorStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new DecoratorStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new DecoratorStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new DecoratorStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new DecoratorStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new DecoratorStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
