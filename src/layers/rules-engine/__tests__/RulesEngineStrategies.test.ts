/**
 * Strategy tests for RulesEngine layer
 */

import { RulesEngineContext } from '../types/rules-engine-types';
import { RulesEngineDefaultStrategy } from '../strategies/DefaultStrategy';
import { RulesEngineFastStrategy } from '../strategies/FastStrategy';
import { RulesEngineReliableStrategy } from '../strategies/ReliableStrategy';
import { RulesEngineCachedStrategy } from '../strategies/CachedStrategy';
import { RulesEngineBatchStrategy } from '../strategies/BatchStrategy';
import { RulesEngineStrategyFactory } from '../factories/RulesEngineStrategyFactory';

function createContext(input: unknown): RulesEngineContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('RulesEngine Strategies', () => {
  const strategies = [
    { name: 'default', cls: RulesEngineDefaultStrategy },
    { name: 'fast', cls: RulesEngineFastStrategy },
    { name: 'reliable', cls: RulesEngineReliableStrategy },
    { name: 'cached', cls: RulesEngineCachedStrategy },
    { name: 'batch', cls: RulesEngineBatchStrategy },
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

  describe('RulesEngineStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new RulesEngineStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new RulesEngineStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new RulesEngineStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new RulesEngineStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new RulesEngineStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
