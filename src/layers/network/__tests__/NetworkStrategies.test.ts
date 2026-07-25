/**
 * Strategy tests for Network layer
 */

import { NetworkDefaultStrategy } from '../strategies/DefaultStrategy';
import { NetworkFastStrategy } from '../strategies/FastStrategy';
import { NetworkReliableStrategy } from '../strategies/ReliableStrategy';
import { NetworkCachedStrategy } from '../strategies/CachedStrategy';
import { NetworkBatchStrategy } from '../strategies/BatchStrategy';
import { NetworkStrategyFactory } from '../factories/NetworkStrategyFactory';

describe('Network Strategies', () => {
  const strategies = [
    { name: 'default', cls: NetworkDefaultStrategy },
    { name: 'fast', cls: NetworkFastStrategy },
    { name: 'reliable', cls: NetworkReliableStrategy },
    { name: 'cached', cls: NetworkCachedStrategy },
    { name: 'batch', cls: NetworkBatchStrategy },
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

  describe('NetworkStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new NetworkStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new NetworkStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new NetworkStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new NetworkStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new NetworkStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
