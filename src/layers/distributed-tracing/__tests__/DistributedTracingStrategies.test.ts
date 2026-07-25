/**
 * Strategy tests for DistributedTracing layer
 */

import { DistributedTracingContext } from '../types/distributed-tracing-types';
import { DistributedTracingDefaultStrategy } from '../strategies/DefaultStrategy';
import { DistributedTracingFastStrategy } from '../strategies/FastStrategy';
import { DistributedTracingReliableStrategy } from '../strategies/ReliableStrategy';
import { DistributedTracingCachedStrategy } from '../strategies/CachedStrategy';
import { DistributedTracingBatchStrategy } from '../strategies/BatchStrategy';
import { DistributedTracingStrategyFactory } from '../factories/DistributedTracingStrategyFactory';

function createContext(input: unknown): DistributedTracingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('DistributedTracing Strategies', () => {
  const strategies = [
    { name: 'default', cls: DistributedTracingDefaultStrategy },
    { name: 'fast', cls: DistributedTracingFastStrategy },
    { name: 'reliable', cls: DistributedTracingReliableStrategy },
    { name: 'cached', cls: DistributedTracingCachedStrategy },
    { name: 'batch', cls: DistributedTracingBatchStrategy },
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

  describe('DistributedTracingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new DistributedTracingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new DistributedTracingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new DistributedTracingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new DistributedTracingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new DistributedTracingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
