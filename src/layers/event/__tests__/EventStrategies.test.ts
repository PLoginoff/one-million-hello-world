/**
 * Strategy tests for Event layer
 */

import { EventDefaultStrategy } from '../strategies/DefaultStrategy';
import { EventFastStrategy } from '../strategies/FastStrategy';
import { EventReliableStrategy } from '../strategies/ReliableStrategy';
import { EventCachedStrategy } from '../strategies/CachedStrategy';
import { EventBatchStrategy } from '../strategies/BatchStrategy';
import { EventStrategyFactory } from '../factories/EventStrategyFactory';

describe('Event Strategies', () => {
  const strategies = [
    { name: 'default', cls: EventDefaultStrategy },
    { name: 'fast', cls: EventFastStrategy },
    { name: 'reliable', cls: EventReliableStrategy },
    { name: 'cached', cls: EventCachedStrategy },
    { name: 'batch', cls: EventBatchStrategy },
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
        const result = await strategy.execute('test');
        expect(result.success).toBe(true);
      });

      it('should track execution count', async () => {
        const strategy = new s.cls();
        await strategy.execute(1);
        await strategy.execute(2);
        await strategy.execute(3);
        expect(strategy.getExecutionCount()).toBe(3);
      });
    });
  });

  describe('EventStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new EventStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new EventStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new EventStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new EventStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new EventStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
