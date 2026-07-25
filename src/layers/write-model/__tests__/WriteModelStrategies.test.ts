/**
 * Strategy tests for WriteModel layer
 */

import { WriteModelContext } from '../types/write-model-types';
import { WriteModelDefaultStrategy } from '../strategies/DefaultStrategy';
import { WriteModelFastStrategy } from '../strategies/FastStrategy';
import { WriteModelReliableStrategy } from '../strategies/ReliableStrategy';
import { WriteModelCachedStrategy } from '../strategies/CachedStrategy';
import { WriteModelBatchStrategy } from '../strategies/BatchStrategy';
import { WriteModelStrategyFactory } from '../factories/WriteModelStrategyFactory';

function createContext(input: unknown): WriteModelContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('WriteModel Strategies', () => {
  const strategies = [
    { name: 'default', cls: WriteModelDefaultStrategy },
    { name: 'fast', cls: WriteModelFastStrategy },
    { name: 'reliable', cls: WriteModelReliableStrategy },
    { name: 'cached', cls: WriteModelCachedStrategy },
    { name: 'batch', cls: WriteModelBatchStrategy },
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

  describe('WriteModelStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new WriteModelStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new WriteModelStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new WriteModelStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new WriteModelStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new WriteModelStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
