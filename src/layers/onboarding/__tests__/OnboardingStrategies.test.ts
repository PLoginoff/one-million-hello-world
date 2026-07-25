/**
 * Strategy tests for Onboarding layer
 */

import { OnboardingContext } from '../types/onboarding-types';
import { OnboardingDefaultStrategy } from '../strategies/DefaultStrategy';
import { OnboardingFastStrategy } from '../strategies/FastStrategy';
import { OnboardingReliableStrategy } from '../strategies/ReliableStrategy';
import { OnboardingCachedStrategy } from '../strategies/CachedStrategy';
import { OnboardingBatchStrategy } from '../strategies/BatchStrategy';
import { OnboardingStrategyFactory } from '../factories/OnboardingStrategyFactory';

function createContext(input: unknown): OnboardingContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Onboarding Strategies', () => {
  const strategies = [
    { name: 'default', cls: OnboardingDefaultStrategy },
    { name: 'fast', cls: OnboardingFastStrategy },
    { name: 'reliable', cls: OnboardingReliableStrategy },
    { name: 'cached', cls: OnboardingCachedStrategy },
    { name: 'batch', cls: OnboardingBatchStrategy },
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

  describe('OnboardingStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new OnboardingStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new OnboardingStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new OnboardingStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new OnboardingStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new OnboardingStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
