/**
 * Strategy tests for Inbox layer
 */

import { InboxContext } from '../types/inbox-types';
import { InboxDefaultStrategy } from '../strategies/DefaultStrategy';
import { InboxFastStrategy } from '../strategies/FastStrategy';
import { InboxReliableStrategy } from '../strategies/ReliableStrategy';
import { InboxCachedStrategy } from '../strategies/CachedStrategy';
import { InboxBatchStrategy } from '../strategies/BatchStrategy';
import { InboxStrategyFactory } from '../factories/InboxStrategyFactory';

function createContext(input: unknown): InboxContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Inbox Strategies', () => {
  const strategies = [
    { name: 'default', cls: InboxDefaultStrategy },
    { name: 'fast', cls: InboxFastStrategy },
    { name: 'reliable', cls: InboxReliableStrategy },
    { name: 'cached', cls: InboxCachedStrategy },
    { name: 'batch', cls: InboxBatchStrategy },
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

  describe('InboxStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new InboxStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new InboxStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new InboxStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new InboxStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new InboxStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
