/**
 * Strategy tests for Recommendation layer
 */

import { RecommendationContext } from '../types/recommendation-types';
import { RecommendationDefaultStrategy } from '../strategies/DefaultStrategy';
import { RecommendationFastStrategy } from '../strategies/FastStrategy';
import { RecommendationReliableStrategy } from '../strategies/ReliableStrategy';
import { RecommendationCachedStrategy } from '../strategies/CachedStrategy';
import { RecommendationBatchStrategy } from '../strategies/BatchStrategy';
import { RecommendationStrategyFactory } from '../factories/RecommendationStrategyFactory';

function createContext(input: unknown): RecommendationContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Recommendation Strategies', () => {
  const strategies = [
    { name: 'default', cls: RecommendationDefaultStrategy },
    { name: 'fast', cls: RecommendationFastStrategy },
    { name: 'reliable', cls: RecommendationReliableStrategy },
    { name: 'cached', cls: RecommendationCachedStrategy },
    { name: 'batch', cls: RecommendationBatchStrategy },
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

  describe('RecommendationStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new RecommendationStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new RecommendationStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new RecommendationStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new RecommendationStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new RecommendationStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
