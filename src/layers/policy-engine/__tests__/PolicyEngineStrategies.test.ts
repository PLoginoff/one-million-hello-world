/**
 * Strategy tests for PolicyEngine layer
 */

import { PolicyEngineContext } from '../types/policy-engine-types';
import { PolicyEngineDefaultStrategy } from '../strategies/DefaultStrategy';
import { PolicyEngineFastStrategy } from '../strategies/FastStrategy';
import { PolicyEngineReliableStrategy } from '../strategies/ReliableStrategy';
import { PolicyEngineCachedStrategy } from '../strategies/CachedStrategy';
import { PolicyEngineBatchStrategy } from '../strategies/BatchStrategy';
import { PolicyEngineStrategyFactory } from '../factories/PolicyEngineStrategyFactory';

function createContext(input: unknown): PolicyEngineContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('PolicyEngine Strategies', () => {
  const strategies = [
    { name: 'default', cls: PolicyEngineDefaultStrategy },
    { name: 'fast', cls: PolicyEngineFastStrategy },
    { name: 'reliable', cls: PolicyEngineReliableStrategy },
    { name: 'cached', cls: PolicyEngineCachedStrategy },
    { name: 'batch', cls: PolicyEngineBatchStrategy },
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

  describe('PolicyEngineStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new PolicyEngineStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new PolicyEngineStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new PolicyEngineStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new PolicyEngineStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new PolicyEngineStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
