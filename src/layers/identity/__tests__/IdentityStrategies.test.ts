/**
 * Strategy tests for Identity layer
 */

import { IdentityContext } from '../types/identity-types';
import { IdentityDefaultStrategy } from '../strategies/DefaultStrategy';
import { IdentityFastStrategy } from '../strategies/FastStrategy';
import { IdentityReliableStrategy } from '../strategies/ReliableStrategy';
import { IdentityCachedStrategy } from '../strategies/CachedStrategy';
import { IdentityBatchStrategy } from '../strategies/BatchStrategy';
import { IdentityStrategyFactory } from '../factories/IdentityStrategyFactory';

function createContext(input: unknown): IdentityContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Identity Strategies', () => {
  const strategies = [
    { name: 'default', cls: IdentityDefaultStrategy },
    { name: 'fast', cls: IdentityFastStrategy },
    { name: 'reliable', cls: IdentityReliableStrategy },
    { name: 'cached', cls: IdentityCachedStrategy },
    { name: 'batch', cls: IdentityBatchStrategy },
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

  describe('IdentityStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new IdentityStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new IdentityStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new IdentityStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new IdentityStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new IdentityStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
