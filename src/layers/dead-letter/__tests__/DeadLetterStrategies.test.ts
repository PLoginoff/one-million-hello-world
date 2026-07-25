/**
 * Strategy tests for DeadLetter layer
 */

import { DeadLetterContext } from '../types/dead-letter-types';
import { DeadLetterDefaultStrategy } from '../strategies/DefaultStrategy';
import { DeadLetterFastStrategy } from '../strategies/FastStrategy';
import { DeadLetterReliableStrategy } from '../strategies/ReliableStrategy';
import { DeadLetterCachedStrategy } from '../strategies/CachedStrategy';
import { DeadLetterBatchStrategy } from '../strategies/BatchStrategy';
import { DeadLetterStrategyFactory } from '../factories/DeadLetterStrategyFactory';

function createContext(input: unknown): DeadLetterContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('DeadLetter Strategies', () => {
  const strategies = [
    { name: 'default', cls: DeadLetterDefaultStrategy },
    { name: 'fast', cls: DeadLetterFastStrategy },
    { name: 'reliable', cls: DeadLetterReliableStrategy },
    { name: 'cached', cls: DeadLetterCachedStrategy },
    { name: 'batch', cls: DeadLetterBatchStrategy },
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

  describe('DeadLetterStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new DeadLetterStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new DeadLetterStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new DeadLetterStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new DeadLetterStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new DeadLetterStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
