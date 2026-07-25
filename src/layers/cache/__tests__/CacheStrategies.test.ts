/**
 * Strategy tests for Cache layer
 */

import { CacheDefaultStrategy } from '../strategies/DefaultStrategy';
import { CacheFastStrategy } from '../strategies/FastStrategy';
import { CacheReliableStrategy } from '../strategies/ReliableStrategy';
import { CacheCachedStrategy } from '../strategies/CachedStrategy';
import { CacheBatchStrategy } from '../strategies/BatchStrategy';
import { CacheStrategyFactory } from '../factories/CacheStrategyFactory';

describe('Cache Strategies', () => {
  const strategies = [
    { name: 'default', cls: CacheDefaultStrategy },
    { name: 'fast', cls: CacheFastStrategy },
    { name: 'reliable', cls: CacheReliableStrategy },
    { name: 'cached', cls: CacheCachedStrategy },
    { name: 'batch', cls: CacheBatchStrategy },
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

  describe('CacheStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new CacheStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new CacheStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new CacheStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new CacheStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new CacheStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
