/**
 * Strategy tests for MultiTenancy layer
 */

import { MultiTenancyContext } from '../types/multi-tenancy-types';
import { MultiTenancyDefaultStrategy } from '../strategies/DefaultStrategy';
import { MultiTenancyFastStrategy } from '../strategies/FastStrategy';
import { MultiTenancyReliableStrategy } from '../strategies/ReliableStrategy';
import { MultiTenancyCachedStrategy } from '../strategies/CachedStrategy';
import { MultiTenancyBatchStrategy } from '../strategies/BatchStrategy';
import { MultiTenancyStrategyFactory } from '../factories/MultiTenancyStrategyFactory';

function createContext(input: unknown): MultiTenancyContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('MultiTenancy Strategies', () => {
  const strategies = [
    { name: 'default', cls: MultiTenancyDefaultStrategy },
    { name: 'fast', cls: MultiTenancyFastStrategy },
    { name: 'reliable', cls: MultiTenancyReliableStrategy },
    { name: 'cached', cls: MultiTenancyCachedStrategy },
    { name: 'batch', cls: MultiTenancyBatchStrategy },
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

  describe('MultiTenancyStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new MultiTenancyStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new MultiTenancyStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new MultiTenancyStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new MultiTenancyStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new MultiTenancyStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
