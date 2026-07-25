/**
 * Strategy tests for BatchProcessing layer
 */

import { BatchProcessingContext } from '../types/batch-processing-types';
import { BatchProcessingDefaultStrategy } from '../strategies/DefaultStrategy';
import { BatchProcessingFastStrategy } from '../strategies/FastStrategy';
import { BatchProcessingReliableStrategy } from '../strategies/ReliableStrategy';
import { BatchProcessingCachedStrategy } from '../strategies/CachedStrategy';
import { BatchProcessingBatchStrategy } from '../strategies/BatchStrategy';
import { BatchProcessingStrategyFactory } from '../factories/BatchProcessingStrategyFactory';

function createContext(input: unknown): BatchProcessingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('BatchProcessing Strategies', () => {
  const strategies = [
    { name: 'default', cls: BatchProcessingDefaultStrategy },
    { name: 'fast', cls: BatchProcessingFastStrategy },
    { name: 'reliable', cls: BatchProcessingReliableStrategy },
    { name: 'cached', cls: BatchProcessingCachedStrategy },
    { name: 'batch', cls: BatchProcessingBatchStrategy },
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

  describe('BatchProcessingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new BatchProcessingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new BatchProcessingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new BatchProcessingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new BatchProcessingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new BatchProcessingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
