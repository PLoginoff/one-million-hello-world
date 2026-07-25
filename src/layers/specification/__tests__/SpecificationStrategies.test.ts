/**
 * Strategy tests for Specification layer
 */

import { SpecificationContext } from '../types/specification-types';
import { SpecificationDefaultStrategy } from '../strategies/DefaultStrategy';
import { SpecificationFastStrategy } from '../strategies/FastStrategy';
import { SpecificationReliableStrategy } from '../strategies/ReliableStrategy';
import { SpecificationCachedStrategy } from '../strategies/CachedStrategy';
import { SpecificationBatchStrategy } from '../strategies/BatchStrategy';
import { SpecificationStrategyFactory } from '../factories/SpecificationStrategyFactory';

function createContext(input: unknown): SpecificationContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Specification Strategies', () => {
  const strategies = [
    { name: 'default', cls: SpecificationDefaultStrategy },
    { name: 'fast', cls: SpecificationFastStrategy },
    { name: 'reliable', cls: SpecificationReliableStrategy },
    { name: 'cached', cls: SpecificationCachedStrategy },
    { name: 'batch', cls: SpecificationBatchStrategy },
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

  describe('SpecificationStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new SpecificationStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new SpecificationStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new SpecificationStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new SpecificationStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new SpecificationStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
