/**
 * Strategy tests for Waf layer
 */

import { WafContext } from '../types/waf-types';
import { WafDefaultStrategy } from '../strategies/DefaultStrategy';
import { WafFastStrategy } from '../strategies/FastStrategy';
import { WafReliableStrategy } from '../strategies/ReliableStrategy';
import { WafCachedStrategy } from '../strategies/CachedStrategy';
import { WafBatchStrategy } from '../strategies/BatchStrategy';
import { WafStrategyFactory } from '../factories/WafStrategyFactory';

function createContext(input: unknown): WafContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Waf Strategies', () => {
  const strategies = [
    { name: 'default', cls: WafDefaultStrategy },
    { name: 'fast', cls: WafFastStrategy },
    { name: 'reliable', cls: WafReliableStrategy },
    { name: 'cached', cls: WafCachedStrategy },
    { name: 'batch', cls: WafBatchStrategy },
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

  describe('WafStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new WafStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new WafStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new WafStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new WafStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new WafStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
