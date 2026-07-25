/**
 * Strategy tests for DataLineage layer
 */

import { DataLineageContext } from '../types/data-lineage-types';
import { DataLineageDefaultStrategy } from '../strategies/DefaultStrategy';
import { DataLineageFastStrategy } from '../strategies/FastStrategy';
import { DataLineageReliableStrategy } from '../strategies/ReliableStrategy';
import { DataLineageCachedStrategy } from '../strategies/CachedStrategy';
import { DataLineageBatchStrategy } from '../strategies/BatchStrategy';
import { DataLineageStrategyFactory } from '../factories/DataLineageStrategyFactory';

function createContext(input: unknown): DataLineageContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('DataLineage Strategies', () => {
  const strategies = [
    { name: 'default', cls: DataLineageDefaultStrategy },
    { name: 'fast', cls: DataLineageFastStrategy },
    { name: 'reliable', cls: DataLineageReliableStrategy },
    { name: 'cached', cls: DataLineageCachedStrategy },
    { name: 'batch', cls: DataLineageBatchStrategy },
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

  describe('DataLineageStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new DataLineageStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new DataLineageStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new DataLineageStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new DataLineageStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new DataLineageStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
