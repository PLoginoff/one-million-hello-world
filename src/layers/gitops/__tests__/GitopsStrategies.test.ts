/**
 * Strategy tests for Gitops layer
 */

import { GitopsContext } from '../types/gitops-types';
import { GitopsDefaultStrategy } from '../strategies/DefaultStrategy';
import { GitopsFastStrategy } from '../strategies/FastStrategy';
import { GitopsReliableStrategy } from '../strategies/ReliableStrategy';
import { GitopsCachedStrategy } from '../strategies/CachedStrategy';
import { GitopsBatchStrategy } from '../strategies/BatchStrategy';
import { GitopsStrategyFactory } from '../factories/GitopsStrategyFactory';

function createContext(input: unknown): GitopsContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Gitops Strategies', () => {
  const strategies = [
    { name: 'default', cls: GitopsDefaultStrategy },
    { name: 'fast', cls: GitopsFastStrategy },
    { name: 'reliable', cls: GitopsReliableStrategy },
    { name: 'cached', cls: GitopsCachedStrategy },
    { name: 'batch', cls: GitopsBatchStrategy },
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

  describe('GitopsStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new GitopsStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new GitopsStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new GitopsStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new GitopsStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new GitopsStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
