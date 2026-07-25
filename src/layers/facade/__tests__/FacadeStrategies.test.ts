/**
 * Strategy tests for Facade layer
 */

import { FacadeDefaultStrategy } from '../strategies/DefaultStrategy';
import { FacadeFastStrategy } from '../strategies/FastStrategy';
import { FacadeReliableStrategy } from '../strategies/ReliableStrategy';
import { FacadeCachedStrategy } from '../strategies/CachedStrategy';
import { FacadeBatchStrategy } from '../strategies/BatchStrategy';
import { FacadeStrategyFactory } from '../factories/FacadeStrategyFactory';

describe('Facade Strategies', () => {
  const strategies = [
    { name: 'default', cls: FacadeDefaultStrategy },
    { name: 'fast', cls: FacadeFastStrategy },
    { name: 'reliable', cls: FacadeReliableStrategy },
    { name: 'cached', cls: FacadeCachedStrategy },
    { name: 'batch', cls: FacadeBatchStrategy },
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

  describe('FacadeStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new FacadeStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new FacadeStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new FacadeStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new FacadeStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new FacadeStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
