/**
 * Strategy tests for ChaosEngineering layer
 */

import { ChaosEngineeringContext } from '../types/chaos-engineering-types';
import { ChaosEngineeringDefaultStrategy } from '../strategies/DefaultStrategy';
import { ChaosEngineeringFastStrategy } from '../strategies/FastStrategy';
import { ChaosEngineeringReliableStrategy } from '../strategies/ReliableStrategy';
import { ChaosEngineeringCachedStrategy } from '../strategies/CachedStrategy';
import { ChaosEngineeringBatchStrategy } from '../strategies/BatchStrategy';
import { ChaosEngineeringStrategyFactory } from '../factories/ChaosEngineeringStrategyFactory';

function createContext(input: unknown): ChaosEngineeringContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('ChaosEngineering Strategies', () => {
  const strategies = [
    { name: 'default', cls: ChaosEngineeringDefaultStrategy },
    { name: 'fast', cls: ChaosEngineeringFastStrategy },
    { name: 'reliable', cls: ChaosEngineeringReliableStrategy },
    { name: 'cached', cls: ChaosEngineeringCachedStrategy },
    { name: 'batch', cls: ChaosEngineeringBatchStrategy },
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

  describe('ChaosEngineeringStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new ChaosEngineeringStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new ChaosEngineeringStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new ChaosEngineeringStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new ChaosEngineeringStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new ChaosEngineeringStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
