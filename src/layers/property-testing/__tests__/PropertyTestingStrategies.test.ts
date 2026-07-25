/**
 * Strategy tests for PropertyTesting layer
 */

import { PropertyTestingContext } from '../types/property-testing-types';
import { PropertyTestingDefaultStrategy } from '../strategies/DefaultStrategy';
import { PropertyTestingFastStrategy } from '../strategies/FastStrategy';
import { PropertyTestingReliableStrategy } from '../strategies/ReliableStrategy';
import { PropertyTestingCachedStrategy } from '../strategies/CachedStrategy';
import { PropertyTestingBatchStrategy } from '../strategies/BatchStrategy';
import { PropertyTestingStrategyFactory } from '../factories/PropertyTestingStrategyFactory';

function createContext(input: unknown): PropertyTestingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('PropertyTesting Strategies', () => {
  const strategies = [
    { name: 'default', cls: PropertyTestingDefaultStrategy },
    { name: 'fast', cls: PropertyTestingFastStrategy },
    { name: 'reliable', cls: PropertyTestingReliableStrategy },
    { name: 'cached', cls: PropertyTestingCachedStrategy },
    { name: 'batch', cls: PropertyTestingBatchStrategy },
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

  describe('PropertyTestingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new PropertyTestingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new PropertyTestingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new PropertyTestingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new PropertyTestingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new PropertyTestingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
