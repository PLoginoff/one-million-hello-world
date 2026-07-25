/**
 * Strategy tests for Secrets layer
 */

import { SecretsContext } from '../types/secrets-types';
import { SecretsDefaultStrategy } from '../strategies/DefaultStrategy';
import { SecretsFastStrategy } from '../strategies/FastStrategy';
import { SecretsReliableStrategy } from '../strategies/ReliableStrategy';
import { SecretsCachedStrategy } from '../strategies/CachedStrategy';
import { SecretsBatchStrategy } from '../strategies/BatchStrategy';
import { SecretsStrategyFactory } from '../factories/SecretsStrategyFactory';

function createContext(input: unknown): SecretsContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Secrets Strategies', () => {
  const strategies = [
    { name: 'default', cls: SecretsDefaultStrategy },
    { name: 'fast', cls: SecretsFastStrategy },
    { name: 'reliable', cls: SecretsReliableStrategy },
    { name: 'cached', cls: SecretsCachedStrategy },
    { name: 'batch', cls: SecretsBatchStrategy },
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

  describe('SecretsStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new SecretsStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new SecretsStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new SecretsStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new SecretsStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new SecretsStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
