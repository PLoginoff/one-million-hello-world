/**
 * Strategy tests for Reporting layer
 */

import { ReportingContext } from '../types/reporting-types';
import { ReportingDefaultStrategy } from '../strategies/DefaultStrategy';
import { ReportingFastStrategy } from '../strategies/FastStrategy';
import { ReportingReliableStrategy } from '../strategies/ReliableStrategy';
import { ReportingCachedStrategy } from '../strategies/CachedStrategy';
import { ReportingBatchStrategy } from '../strategies/BatchStrategy';
import { ReportingStrategyFactory } from '../factories/ReportingStrategyFactory';

function createContext(input: unknown): ReportingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Reporting Strategies', () => {
  const strategies = [
    { name: 'default', cls: ReportingDefaultStrategy },
    { name: 'fast', cls: ReportingFastStrategy },
    { name: 'reliable', cls: ReportingReliableStrategy },
    { name: 'cached', cls: ReportingCachedStrategy },
    { name: 'batch', cls: ReportingBatchStrategy },
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

  describe('ReportingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new ReportingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new ReportingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new ReportingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new ReportingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new ReportingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
