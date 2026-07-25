/**
 * Strategy tests for Domain layer
 */

import { DomainDefaultStrategy } from '../strategies/DefaultStrategy';
import { DomainFastStrategy } from '../strategies/FastStrategy';
import { DomainReliableStrategy } from '../strategies/ReliableStrategy';
import { DomainCachedStrategy } from '../strategies/CachedStrategy';
import { DomainBatchStrategy } from '../strategies/BatchStrategy';
import { DomainStrategyFactory } from '../factories/DomainStrategyFactory';

describe('Domain Strategies', () => {
  const strategies = [
    { name: 'default', cls: DomainDefaultStrategy },
    { name: 'fast', cls: DomainFastStrategy },
    { name: 'reliable', cls: DomainReliableStrategy },
    { name: 'cached', cls: DomainCachedStrategy },
    { name: 'batch', cls: DomainBatchStrategy },
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

  describe('DomainStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new DomainStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new DomainStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new DomainStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new DomainStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new DomainStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
