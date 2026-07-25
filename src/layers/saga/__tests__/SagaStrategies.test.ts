/**
 * Strategy tests for Saga layer
 */

import { SagaDefaultStrategy } from '../strategies/DefaultStrategy';
import { SagaFastStrategy } from '../strategies/FastStrategy';
import { SagaReliableStrategy } from '../strategies/ReliableStrategy';
import { SagaCachedStrategy } from '../strategies/CachedStrategy';
import { SagaBatchStrategy } from '../strategies/BatchStrategy';
import { SagaStrategyFactory } from '../factories/SagaStrategyFactory';

describe('Saga Strategies', () => {
  const strategies = [
    { name: 'default', cls: SagaDefaultStrategy },
    { name: 'fast', cls: SagaFastStrategy },
    { name: 'reliable', cls: SagaReliableStrategy },
    { name: 'cached', cls: SagaCachedStrategy },
    { name: 'batch', cls: SagaBatchStrategy },
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

  describe('SagaStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new SagaStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new SagaStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new SagaStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new SagaStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new SagaStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
