/**
 * Strategy tests for Scheduling layer
 */

import { SchedulingContext } from '../types/scheduling-types';
import { SchedulingDefaultStrategy } from '../strategies/DefaultStrategy';
import { SchedulingFastStrategy } from '../strategies/FastStrategy';
import { SchedulingReliableStrategy } from '../strategies/ReliableStrategy';
import { SchedulingCachedStrategy } from '../strategies/CachedStrategy';
import { SchedulingBatchStrategy } from '../strategies/BatchStrategy';
import { SchedulingStrategyFactory } from '../factories/SchedulingStrategyFactory';

function createContext(input: unknown): SchedulingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Scheduling Strategies', () => {
  const strategies = [
    { name: 'default', cls: SchedulingDefaultStrategy },
    { name: 'fast', cls: SchedulingFastStrategy },
    { name: 'reliable', cls: SchedulingReliableStrategy },
    { name: 'cached', cls: SchedulingCachedStrategy },
    { name: 'batch', cls: SchedulingBatchStrategy },
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

  describe('SchedulingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new SchedulingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new SchedulingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new SchedulingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new SchedulingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new SchedulingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
