/**
 * Strategy tests for CostOptimization layer
 */

import { CostOptimizationContext } from '../types/cost-optimization-types';
import { CostOptimizationDefaultStrategy } from '../strategies/DefaultStrategy';
import { CostOptimizationFastStrategy } from '../strategies/FastStrategy';
import { CostOptimizationReliableStrategy } from '../strategies/ReliableStrategy';
import { CostOptimizationCachedStrategy } from '../strategies/CachedStrategy';
import { CostOptimizationBatchStrategy } from '../strategies/BatchStrategy';
import { CostOptimizationStrategyFactory } from '../factories/CostOptimizationStrategyFactory';

function createContext(input: unknown): CostOptimizationContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('CostOptimization Strategies', () => {
  const strategies = [
    { name: 'default', cls: CostOptimizationDefaultStrategy },
    { name: 'fast', cls: CostOptimizationFastStrategy },
    { name: 'reliable', cls: CostOptimizationReliableStrategy },
    { name: 'cached', cls: CostOptimizationCachedStrategy },
    { name: 'batch', cls: CostOptimizationBatchStrategy },
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
        const result = await strategy.execute(createContext('test'));
        expect(result.success).toBe(true);
      });

      it('should track execution count', async () => {
        const strategy = new s.cls();
        await strategy.execute(createContext(1));
        await strategy.execute(createContext(2));
        await strategy.execute(createContext(3));
        expect(strategy.getExecutionCount()).toBe(3);
      });
    });
  });

  describe('CostOptimizationStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new CostOptimizationStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new CostOptimizationStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new CostOptimizationStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new CostOptimizationStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new CostOptimizationStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
