/**
 * Strategy tests for DataQuality layer
 */

import { DataQualityContext } from '../types/data-quality-types';
import { DataQualityDefaultStrategy } from '../strategies/DefaultStrategy';
import { DataQualityFastStrategy } from '../strategies/FastStrategy';
import { DataQualityReliableStrategy } from '../strategies/ReliableStrategy';
import { DataQualityCachedStrategy } from '../strategies/CachedStrategy';
import { DataQualityBatchStrategy } from '../strategies/BatchStrategy';
import { DataQualityStrategyFactory } from '../factories/DataQualityStrategyFactory';

function createContext(input: unknown): DataQualityContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('DataQuality Strategies', () => {
  const strategies = [
    { name: 'default', cls: DataQualityDefaultStrategy },
    { name: 'fast', cls: DataQualityFastStrategy },
    { name: 'reliable', cls: DataQualityReliableStrategy },
    { name: 'cached', cls: DataQualityCachedStrategy },
    { name: 'batch', cls: DataQualityBatchStrategy },
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

  describe('DataQualityStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new DataQualityStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new DataQualityStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new DataQualityStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new DataQualityStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new DataQualityStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
