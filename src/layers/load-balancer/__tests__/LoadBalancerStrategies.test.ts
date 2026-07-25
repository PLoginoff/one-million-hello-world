/**
 * Strategy tests for LoadBalancer layer
 */

import { LoadBalancerContext } from '../types/load-balancer-types';
import { LoadBalancerDefaultStrategy } from '../strategies/DefaultStrategy';
import { LoadBalancerFastStrategy } from '../strategies/FastStrategy';
import { LoadBalancerReliableStrategy } from '../strategies/ReliableStrategy';
import { LoadBalancerCachedStrategy } from '../strategies/CachedStrategy';
import { LoadBalancerBatchStrategy } from '../strategies/BatchStrategy';
import { LoadBalancerStrategyFactory } from '../factories/LoadBalancerStrategyFactory';

function createContext(input: unknown): LoadBalancerContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('LoadBalancer Strategies', () => {
  const strategies = [
    { name: 'default', cls: LoadBalancerDefaultStrategy },
    { name: 'fast', cls: LoadBalancerFastStrategy },
    { name: 'reliable', cls: LoadBalancerReliableStrategy },
    { name: 'cached', cls: LoadBalancerCachedStrategy },
    { name: 'batch', cls: LoadBalancerBatchStrategy },
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

  describe('LoadBalancerStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new LoadBalancerStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new LoadBalancerStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new LoadBalancerStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new LoadBalancerStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new LoadBalancerStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
