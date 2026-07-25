/**
 * Strategy tests for Search layer
 */

import { SearchContext } from '../types/search-types';
import { SearchDefaultStrategy } from '../strategies/DefaultStrategy';
import { SearchFastStrategy } from '../strategies/FastStrategy';
import { SearchReliableStrategy } from '../strategies/ReliableStrategy';
import { SearchCachedStrategy } from '../strategies/CachedStrategy';
import { SearchBatchStrategy } from '../strategies/BatchStrategy';
import { SearchStrategyFactory } from '../factories/SearchStrategyFactory';

function createContext(input: unknown): SearchContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Search Strategies', () => {
  const strategies = [
    { name: 'default', cls: SearchDefaultStrategy },
    { name: 'fast', cls: SearchFastStrategy },
    { name: 'reliable', cls: SearchReliableStrategy },
    { name: 'cached', cls: SearchCachedStrategy },
    { name: 'batch', cls: SearchBatchStrategy },
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

  describe('SearchStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new SearchStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new SearchStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new SearchStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new SearchStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new SearchStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
