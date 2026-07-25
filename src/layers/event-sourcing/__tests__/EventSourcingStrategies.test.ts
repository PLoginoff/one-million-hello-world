/**
 * Strategy tests for EventSourcing layer
 */

import { EventSourcingContext } from '../types/event-sourcing-types';
import { EventSourcingDefaultStrategy } from '../strategies/DefaultStrategy';
import { EventSourcingFastStrategy } from '../strategies/FastStrategy';
import { EventSourcingReliableStrategy } from '../strategies/ReliableStrategy';
import { EventSourcingCachedStrategy } from '../strategies/CachedStrategy';
import { EventSourcingBatchStrategy } from '../strategies/BatchStrategy';
import { EventSourcingStrategyFactory } from '../factories/EventSourcingStrategyFactory';

function createContext(input: unknown): EventSourcingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('EventSourcing Strategies', () => {
  const strategies = [
    { name: 'default', cls: EventSourcingDefaultStrategy },
    { name: 'fast', cls: EventSourcingFastStrategy },
    { name: 'reliable', cls: EventSourcingReliableStrategy },
    { name: 'cached', cls: EventSourcingCachedStrategy },
    { name: 'batch', cls: EventSourcingBatchStrategy },
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

  describe('EventSourcingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new EventSourcingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new EventSourcingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new EventSourcingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new EventSourcingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new EventSourcingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
