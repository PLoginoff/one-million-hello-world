/**
 * Strategy tests for Localization layer
 */

import { LocalizationContext } from '../types/localization-types';
import { LocalizationDefaultStrategy } from '../strategies/DefaultStrategy';
import { LocalizationFastStrategy } from '../strategies/FastStrategy';
import { LocalizationReliableStrategy } from '../strategies/ReliableStrategy';
import { LocalizationCachedStrategy } from '../strategies/CachedStrategy';
import { LocalizationBatchStrategy } from '../strategies/BatchStrategy';
import { LocalizationStrategyFactory } from '../factories/LocalizationStrategyFactory';

function createContext(input: unknown): LocalizationContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Localization Strategies', () => {
  const strategies = [
    { name: 'default', cls: LocalizationDefaultStrategy },
    { name: 'fast', cls: LocalizationFastStrategy },
    { name: 'reliable', cls: LocalizationReliableStrategy },
    { name: 'cached', cls: LocalizationCachedStrategy },
    { name: 'batch', cls: LocalizationBatchStrategy },
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

  describe('LocalizationStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new LocalizationStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new LocalizationStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new LocalizationStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new LocalizationStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new LocalizationStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
