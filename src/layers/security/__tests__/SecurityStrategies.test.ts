/**
 * Strategy tests for Security layer
 */

import { SecurityDefaultStrategy } from '../strategies/DefaultStrategy';
import { SecurityFastStrategy } from '../strategies/FastStrategy';
import { SecurityReliableStrategy } from '../strategies/ReliableStrategy';
import { SecurityCachedStrategy } from '../strategies/CachedStrategy';
import { SecurityBatchStrategy } from '../strategies/BatchStrategy';
import { SecurityStrategyFactory } from '../factories/SecurityStrategyFactory';

describe('Security Strategies', () => {
  const strategies = [
    { name: 'default', cls: SecurityDefaultStrategy },
    { name: 'fast', cls: SecurityFastStrategy },
    { name: 'reliable', cls: SecurityReliableStrategy },
    { name: 'cached', cls: SecurityCachedStrategy },
    { name: 'batch', cls: SecurityBatchStrategy },
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

  describe('SecurityStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new SecurityStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new SecurityStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new SecurityStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new SecurityStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new SecurityStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
