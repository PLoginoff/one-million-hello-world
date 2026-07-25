/**
 * Strategy tests for Billing layer
 */

import { BillingContext } from '../types/billing-types';
import { BillingDefaultStrategy } from '../strategies/DefaultStrategy';
import { BillingFastStrategy } from '../strategies/FastStrategy';
import { BillingReliableStrategy } from '../strategies/ReliableStrategy';
import { BillingCachedStrategy } from '../strategies/CachedStrategy';
import { BillingBatchStrategy } from '../strategies/BatchStrategy';
import { BillingStrategyFactory } from '../factories/BillingStrategyFactory';

function createContext(input: unknown): BillingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Billing Strategies', () => {
  const strategies = [
    { name: 'default', cls: BillingDefaultStrategy },
    { name: 'fast', cls: BillingFastStrategy },
    { name: 'reliable', cls: BillingReliableStrategy },
    { name: 'cached', cls: BillingCachedStrategy },
    { name: 'batch', cls: BillingBatchStrategy },
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

  describe('BillingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new BillingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new BillingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new BillingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new BillingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new BillingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
