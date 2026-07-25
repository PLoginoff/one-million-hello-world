/**
 * Strategy tests for ContractTesting layer
 */

import { ContractTestingContext } from '../types/contract-testing-types';
import { ContractTestingDefaultStrategy } from '../strategies/DefaultStrategy';
import { ContractTestingFastStrategy } from '../strategies/FastStrategy';
import { ContractTestingReliableStrategy } from '../strategies/ReliableStrategy';
import { ContractTestingCachedStrategy } from '../strategies/CachedStrategy';
import { ContractTestingBatchStrategy } from '../strategies/BatchStrategy';
import { ContractTestingStrategyFactory } from '../factories/ContractTestingStrategyFactory';

function createContext(input: unknown): ContractTestingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('ContractTesting Strategies', () => {
  const strategies = [
    { name: 'default', cls: ContractTestingDefaultStrategy },
    { name: 'fast', cls: ContractTestingFastStrategy },
    { name: 'reliable', cls: ContractTestingReliableStrategy },
    { name: 'cached', cls: ContractTestingCachedStrategy },
    { name: 'batch', cls: ContractTestingBatchStrategy },
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

  describe('ContractTestingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new ContractTestingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new ContractTestingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new ContractTestingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new ContractTestingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new ContractTestingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
