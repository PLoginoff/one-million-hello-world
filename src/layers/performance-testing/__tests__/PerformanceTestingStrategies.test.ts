/**
 * Strategy tests for PerformanceTesting layer
 */

import { PerformanceTestingContext } from '../types/performance-testing-types';
import { PerformanceTestingDefaultStrategy } from '../strategies/DefaultStrategy';
import { PerformanceTestingFastStrategy } from '../strategies/FastStrategy';
import { PerformanceTestingReliableStrategy } from '../strategies/ReliableStrategy';
import { PerformanceTestingCachedStrategy } from '../strategies/CachedStrategy';
import { PerformanceTestingBatchStrategy } from '../strategies/BatchStrategy';
import { PerformanceTestingStrategyFactory } from '../factories/PerformanceTestingStrategyFactory';

function createContext(input: unknown): PerformanceTestingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('PerformanceTesting Strategies', () => {
  const strategies = [
    { name: 'default', cls: PerformanceTestingDefaultStrategy },
    { name: 'fast', cls: PerformanceTestingFastStrategy },
    { name: 'reliable', cls: PerformanceTestingReliableStrategy },
    { name: 'cached', cls: PerformanceTestingCachedStrategy },
    { name: 'batch', cls: PerformanceTestingBatchStrategy },
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

  describe('PerformanceTestingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new PerformanceTestingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new PerformanceTestingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new PerformanceTestingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new PerformanceTestingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new PerformanceTestingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
