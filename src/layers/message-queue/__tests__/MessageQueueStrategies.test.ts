/**
 * Strategy tests for MessageQueue layer
 */

import { MessageQueueDefaultStrategy } from '../strategies/DefaultStrategy';
import { MessageQueueFastStrategy } from '../strategies/FastStrategy';
import { MessageQueueReliableStrategy } from '../strategies/ReliableStrategy';
import { MessageQueueCachedStrategy } from '../strategies/CachedStrategy';
import { MessageQueueBatchStrategy } from '../strategies/BatchStrategy';
import { MessageQueueStrategyFactory } from '../factories/MessageQueueStrategyFactory';

describe('MessageQueue Strategies', () => {
  const strategies = [
    { name: 'default', cls: MessageQueueDefaultStrategy },
    { name: 'fast', cls: MessageQueueFastStrategy },
    { name: 'reliable', cls: MessageQueueReliableStrategy },
    { name: 'cached', cls: MessageQueueCachedStrategy },
    { name: 'batch', cls: MessageQueueBatchStrategy },
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

  describe('MessageQueueStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new MessageQueueStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new MessageQueueStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new MessageQueueStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new MessageQueueStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new MessageQueueStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
