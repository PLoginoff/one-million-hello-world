/**
 * Strategy tests for Transport layer
 */

import { TransportDefaultStrategy } from '../strategies/DefaultStrategy';
import { TransportFastStrategy } from '../strategies/FastStrategy';
import { TransportReliableStrategy } from '../strategies/ReliableStrategy';
import { TransportCachedStrategy } from '../strategies/CachedStrategy';
import { TransportBatchStrategy } from '../strategies/BatchStrategy';
import { TransportStrategyFactory } from '../factories/TransportStrategyFactory';

describe('Transport Strategies', () => {
  const strategies = [
    { name: 'default', cls: TransportDefaultStrategy },
    { name: 'fast', cls: TransportFastStrategy },
    { name: 'reliable', cls: TransportReliableStrategy },
    { name: 'cached', cls: TransportCachedStrategy },
    { name: 'batch', cls: TransportBatchStrategy },
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

  describe('TransportStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new TransportStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new TransportStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new TransportStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new TransportStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new TransportStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
