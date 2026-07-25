/**
 * Strategy tests for ReadModel layer
 */

import { ReadModelContext } from '../types/read-model-types';
import { ReadModelDefaultStrategy } from '../strategies/DefaultStrategy';
import { ReadModelFastStrategy } from '../strategies/FastStrategy';
import { ReadModelReliableStrategy } from '../strategies/ReliableStrategy';
import { ReadModelCachedStrategy } from '../strategies/CachedStrategy';
import { ReadModelBatchStrategy } from '../strategies/BatchStrategy';
import { ReadModelStrategyFactory } from '../factories/ReadModelStrategyFactory';

function createContext(input: unknown): ReadModelContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('ReadModel Strategies', () => {
  const strategies = [
    { name: 'default', cls: ReadModelDefaultStrategy },
    { name: 'fast', cls: ReadModelFastStrategy },
    { name: 'reliable', cls: ReadModelReliableStrategy },
    { name: 'cached', cls: ReadModelCachedStrategy },
    { name: 'batch', cls: ReadModelBatchStrategy },
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

  describe('ReadModelStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new ReadModelStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new ReadModelStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new ReadModelStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new ReadModelStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new ReadModelStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
