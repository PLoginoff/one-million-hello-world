/**
 * Strategy tests for MutationTesting layer
 */

import { MutationTestingContext } from '../types/mutation-testing-types';
import { MutationTestingDefaultStrategy } from '../strategies/DefaultStrategy';
import { MutationTestingFastStrategy } from '../strategies/FastStrategy';
import { MutationTestingReliableStrategy } from '../strategies/ReliableStrategy';
import { MutationTestingCachedStrategy } from '../strategies/CachedStrategy';
import { MutationTestingBatchStrategy } from '../strategies/BatchStrategy';
import { MutationTestingStrategyFactory } from '../factories/MutationTestingStrategyFactory';

function createContext(input: unknown): MutationTestingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('MutationTesting Strategies', () => {
  const strategies = [
    { name: 'default', cls: MutationTestingDefaultStrategy },
    { name: 'fast', cls: MutationTestingFastStrategy },
    { name: 'reliable', cls: MutationTestingReliableStrategy },
    { name: 'cached', cls: MutationTestingCachedStrategy },
    { name: 'batch', cls: MutationTestingBatchStrategy },
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

  describe('MutationTestingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new MutationTestingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new MutationTestingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new MutationTestingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new MutationTestingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new MutationTestingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
