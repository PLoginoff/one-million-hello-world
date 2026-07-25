/**
 * Strategy tests for EdgeCache layer
 */

import { EdgeCacheContext } from '../types/edge-cache-types';
import { EdgeCacheDefaultStrategy } from '../strategies/DefaultStrategy';
import { EdgeCacheFastStrategy } from '../strategies/FastStrategy';
import { EdgeCacheReliableStrategy } from '../strategies/ReliableStrategy';
import { EdgeCacheCachedStrategy } from '../strategies/CachedStrategy';
import { EdgeCacheBatchStrategy } from '../strategies/BatchStrategy';
import { EdgeCacheStrategyFactory } from '../factories/EdgeCacheStrategyFactory';

function createContext(input: unknown): EdgeCacheContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('EdgeCache Strategies', () => {
  const strategies = [
    { name: 'default', cls: EdgeCacheDefaultStrategy },
    { name: 'fast', cls: EdgeCacheFastStrategy },
    { name: 'reliable', cls: EdgeCacheReliableStrategy },
    { name: 'cached', cls: EdgeCacheCachedStrategy },
    { name: 'batch', cls: EdgeCacheBatchStrategy },
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

  describe('EdgeCacheStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new EdgeCacheStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new EdgeCacheStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new EdgeCacheStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new EdgeCacheStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new EdgeCacheStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
