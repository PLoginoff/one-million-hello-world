/**
 * Strategy tests for Repository layer
 */

import { RepositoryDefaultStrategy } from '../strategies/DefaultStrategy';
import { RepositoryFastStrategy } from '../strategies/FastStrategy';
import { RepositoryReliableStrategy } from '../strategies/ReliableStrategy';
import { RepositoryCachedStrategy } from '../strategies/CachedStrategy';
import { RepositoryBatchStrategy } from '../strategies/BatchStrategy';
import { RepositoryStrategyFactory } from '../factories/RepositoryStrategyFactory';

describe('Repository Strategies', () => {
  const strategies = [
    { name: 'default', cls: RepositoryDefaultStrategy },
    { name: 'fast', cls: RepositoryFastStrategy },
    { name: 'reliable', cls: RepositoryReliableStrategy },
    { name: 'cached', cls: RepositoryCachedStrategy },
    { name: 'batch', cls: RepositoryBatchStrategy },
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

  describe('RepositoryStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new RepositoryStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new RepositoryStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new RepositoryStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new RepositoryStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new RepositoryStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
