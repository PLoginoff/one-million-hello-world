/**
 * Strategy tests for Cqrs layer
 */

import { CqrsContext } from '../types/cqrs-types';
import { CqrsDefaultStrategy } from '../strategies/DefaultStrategy';
import { CqrsFastStrategy } from '../strategies/FastStrategy';
import { CqrsReliableStrategy } from '../strategies/ReliableStrategy';
import { CqrsCachedStrategy } from '../strategies/CachedStrategy';
import { CqrsBatchStrategy } from '../strategies/BatchStrategy';
import { CqrsStrategyFactory } from '../factories/CqrsStrategyFactory';

function createContext(input: unknown): CqrsContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Cqrs Strategies', () => {
  const strategies = [
    { name: 'default', cls: CqrsDefaultStrategy },
    { name: 'fast', cls: CqrsFastStrategy },
    { name: 'reliable', cls: CqrsReliableStrategy },
    { name: 'cached', cls: CqrsCachedStrategy },
    { name: 'batch', cls: CqrsBatchStrategy },
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

  describe('CqrsStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new CqrsStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new CqrsStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new CqrsStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new CqrsStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new CqrsStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
