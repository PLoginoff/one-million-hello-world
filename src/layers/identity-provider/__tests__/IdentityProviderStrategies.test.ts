/**
 * Strategy tests for IdentityProvider layer
 */

import { IdentityProviderContext } from '../types/identity-provider-types';
import { IdentityProviderDefaultStrategy } from '../strategies/DefaultStrategy';
import { IdentityProviderFastStrategy } from '../strategies/FastStrategy';
import { IdentityProviderReliableStrategy } from '../strategies/ReliableStrategy';
import { IdentityProviderCachedStrategy } from '../strategies/CachedStrategy';
import { IdentityProviderBatchStrategy } from '../strategies/BatchStrategy';
import { IdentityProviderStrategyFactory } from '../factories/IdentityProviderStrategyFactory';

function createContext(input: unknown): IdentityProviderContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('IdentityProvider Strategies', () => {
  const strategies = [
    { name: 'default', cls: IdentityProviderDefaultStrategy },
    { name: 'fast', cls: IdentityProviderFastStrategy },
    { name: 'reliable', cls: IdentityProviderReliableStrategy },
    { name: 'cached', cls: IdentityProviderCachedStrategy },
    { name: 'batch', cls: IdentityProviderBatchStrategy },
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

  describe('IdentityProviderStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new IdentityProviderStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new IdentityProviderStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new IdentityProviderStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new IdentityProviderStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new IdentityProviderStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
