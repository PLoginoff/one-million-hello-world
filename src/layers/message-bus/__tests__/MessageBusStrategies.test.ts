/**
 * Strategy tests for MessageBus layer
 */

import { MessageBusContext } from '../types/message-bus-types';
import { MessageBusDefaultStrategy } from '../strategies/DefaultStrategy';
import { MessageBusFastStrategy } from '../strategies/FastStrategy';
import { MessageBusReliableStrategy } from '../strategies/ReliableStrategy';
import { MessageBusCachedStrategy } from '../strategies/CachedStrategy';
import { MessageBusBatchStrategy } from '../strategies/BatchStrategy';
import { MessageBusStrategyFactory } from '../factories/MessageBusStrategyFactory';

function createContext(input: unknown): MessageBusContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('MessageBus Strategies', () => {
  const strategies = [
    { name: 'default', cls: MessageBusDefaultStrategy },
    { name: 'fast', cls: MessageBusFastStrategy },
    { name: 'reliable', cls: MessageBusReliableStrategy },
    { name: 'cached', cls: MessageBusCachedStrategy },
    { name: 'batch', cls: MessageBusBatchStrategy },
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

  describe('MessageBusStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new MessageBusStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new MessageBusStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new MessageBusStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new MessageBusStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new MessageBusStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
