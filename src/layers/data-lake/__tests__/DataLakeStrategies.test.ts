/**
 * Strategy tests for DataLake layer
 */

import { DataLakeContext } from '../types/data-lake-types';
import { DataLakeDefaultStrategy } from '../strategies/DefaultStrategy';
import { DataLakeFastStrategy } from '../strategies/FastStrategy';
import { DataLakeReliableStrategy } from '../strategies/ReliableStrategy';
import { DataLakeCachedStrategy } from '../strategies/CachedStrategy';
import { DataLakeBatchStrategy } from '../strategies/BatchStrategy';
import { DataLakeStrategyFactory } from '../factories/DataLakeStrategyFactory';

function createContext(input: unknown): DataLakeContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('DataLake Strategies', () => {
  const strategies = [
    { name: 'default', cls: DataLakeDefaultStrategy },
    { name: 'fast', cls: DataLakeFastStrategy },
    { name: 'reliable', cls: DataLakeReliableStrategy },
    { name: 'cached', cls: DataLakeCachedStrategy },
    { name: 'batch', cls: DataLakeBatchStrategy },
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

  describe('DataLakeStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new DataLakeStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new DataLakeStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new DataLakeStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new DataLakeStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new DataLakeStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
