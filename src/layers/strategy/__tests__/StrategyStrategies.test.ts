/**
 * Strategy tests for Strategy layer
 */

import { StrategyDefaultStrategy } from '../strategies/DefaultStrategy';
import { StrategyFastStrategy } from '../strategies/FastStrategy';
import { StrategyReliableStrategy } from '../strategies/ReliableStrategy';
import { StrategyCachedStrategy } from '../strategies/CachedStrategy';
import { StrategyBatchStrategy } from '../strategies/BatchStrategy';
import { StrategyStrategyFactory } from '../factories/StrategyStrategyFactory';

describe('Strategy Strategies', () => {
  const strategies = [
    { name: 'default', cls: StrategyDefaultStrategy },
    { name: 'fast', cls: StrategyFastStrategy },
    { name: 'reliable', cls: StrategyReliableStrategy },
    { name: 'cached', cls: StrategyCachedStrategy },
    { name: 'batch', cls: StrategyBatchStrategy },
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

  describe('StrategyStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new StrategyStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new StrategyStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new StrategyStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new StrategyStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new StrategyStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
