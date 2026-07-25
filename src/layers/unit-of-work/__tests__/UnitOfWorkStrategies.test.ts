/**
 * Strategy tests for UnitOfWork layer
 */

import { UnitOfWorkContext } from '../types/unit-of-work-types';
import { UnitOfWorkDefaultStrategy } from '../strategies/DefaultStrategy';
import { UnitOfWorkFastStrategy } from '../strategies/FastStrategy';
import { UnitOfWorkReliableStrategy } from '../strategies/ReliableStrategy';
import { UnitOfWorkCachedStrategy } from '../strategies/CachedStrategy';
import { UnitOfWorkBatchStrategy } from '../strategies/BatchStrategy';
import { UnitOfWorkStrategyFactory } from '../factories/UnitOfWorkStrategyFactory';

function createContext(input: unknown): UnitOfWorkContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('UnitOfWork Strategies', () => {
  const strategies = [
    { name: 'default', cls: UnitOfWorkDefaultStrategy },
    { name: 'fast', cls: UnitOfWorkFastStrategy },
    { name: 'reliable', cls: UnitOfWorkReliableStrategy },
    { name: 'cached', cls: UnitOfWorkCachedStrategy },
    { name: 'batch', cls: UnitOfWorkBatchStrategy },
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

  describe('UnitOfWorkStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new UnitOfWorkStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new UnitOfWorkStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new UnitOfWorkStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new UnitOfWorkStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new UnitOfWorkStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
