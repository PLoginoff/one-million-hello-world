/**
 * Strategy tests for Service layer
 */

import { ServiceDefaultStrategy } from '../strategies/DefaultStrategy';
import { ServiceFastStrategy } from '../strategies/FastStrategy';
import { ServiceReliableStrategy } from '../strategies/ReliableStrategy';
import { ServiceCachedStrategy } from '../strategies/CachedStrategy';
import { ServiceBatchStrategy } from '../strategies/BatchStrategy';
import { ServiceStrategyFactory } from '../factories/ServiceStrategyFactory';

describe('Service Strategies', () => {
  const strategies = [
    { name: 'default', cls: ServiceDefaultStrategy },
    { name: 'fast', cls: ServiceFastStrategy },
    { name: 'reliable', cls: ServiceReliableStrategy },
    { name: 'cached', cls: ServiceCachedStrategy },
    { name: 'batch', cls: ServiceBatchStrategy },
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

  describe('ServiceStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new ServiceStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new ServiceStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new ServiceStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new ServiceStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new ServiceStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
