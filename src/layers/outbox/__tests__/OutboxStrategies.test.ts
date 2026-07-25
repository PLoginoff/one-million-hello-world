/**
 * Strategy tests for Outbox layer
 */

import { OutboxContext } from '../types/outbox-types';
import { OutboxDefaultStrategy } from '../strategies/DefaultStrategy';
import { OutboxFastStrategy } from '../strategies/FastStrategy';
import { OutboxReliableStrategy } from '../strategies/ReliableStrategy';
import { OutboxCachedStrategy } from '../strategies/CachedStrategy';
import { OutboxBatchStrategy } from '../strategies/BatchStrategy';
import { OutboxStrategyFactory } from '../factories/OutboxStrategyFactory';

function createContext(input: unknown): OutboxContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Outbox Strategies', () => {
  const strategies = [
    { name: 'default', cls: OutboxDefaultStrategy },
    { name: 'fast', cls: OutboxFastStrategy },
    { name: 'reliable', cls: OutboxReliableStrategy },
    { name: 'cached', cls: OutboxCachedStrategy },
    { name: 'batch', cls: OutboxBatchStrategy },
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

  describe('OutboxStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new OutboxStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new OutboxStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new OutboxStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new OutboxStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new OutboxStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
