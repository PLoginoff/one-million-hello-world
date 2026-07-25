/**
 * Strategy tests for ApiVersioning layer
 */

import { ApiVersioningContext } from '../types/api-versioning-types';
import { ApiVersioningDefaultStrategy } from '../strategies/DefaultStrategy';
import { ApiVersioningFastStrategy } from '../strategies/FastStrategy';
import { ApiVersioningReliableStrategy } from '../strategies/ReliableStrategy';
import { ApiVersioningCachedStrategy } from '../strategies/CachedStrategy';
import { ApiVersioningBatchStrategy } from '../strategies/BatchStrategy';
import { ApiVersioningStrategyFactory } from '../factories/ApiVersioningStrategyFactory';

function createContext(input: unknown): ApiVersioningContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('ApiVersioning Strategies', () => {
  const strategies = [
    { name: 'default', cls: ApiVersioningDefaultStrategy },
    { name: 'fast', cls: ApiVersioningFastStrategy },
    { name: 'reliable', cls: ApiVersioningReliableStrategy },
    { name: 'cached', cls: ApiVersioningCachedStrategy },
    { name: 'batch', cls: ApiVersioningBatchStrategy },
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

  describe('ApiVersioningStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new ApiVersioningStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new ApiVersioningStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new ApiVersioningStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new ApiVersioningStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new ApiVersioningStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
