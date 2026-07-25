/**
 * Strategy tests for Graphql layer
 */

import { GraphqlContext } from '../types/graphql-types';
import { GraphqlDefaultStrategy } from '../strategies/DefaultStrategy';
import { GraphqlFastStrategy } from '../strategies/FastStrategy';
import { GraphqlReliableStrategy } from '../strategies/ReliableStrategy';
import { GraphqlCachedStrategy } from '../strategies/CachedStrategy';
import { GraphqlBatchStrategy } from '../strategies/BatchStrategy';
import { GraphqlStrategyFactory } from '../factories/GraphqlStrategyFactory';

function createContext(input: unknown): GraphqlContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Graphql Strategies', () => {
  const strategies = [
    { name: 'default', cls: GraphqlDefaultStrategy },
    { name: 'fast', cls: GraphqlFastStrategy },
    { name: 'reliable', cls: GraphqlReliableStrategy },
    { name: 'cached', cls: GraphqlCachedStrategy },
    { name: 'batch', cls: GraphqlBatchStrategy },
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

  describe('GraphqlStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new GraphqlStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new GraphqlStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new GraphqlStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new GraphqlStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new GraphqlStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
