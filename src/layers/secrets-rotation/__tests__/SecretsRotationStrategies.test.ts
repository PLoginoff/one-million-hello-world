/**
 * Strategy tests for SecretsRotation layer
 */

import { SecretsRotationContext } from '../types/secrets-rotation-types';
import { SecretsRotationDefaultStrategy } from '../strategies/DefaultStrategy';
import { SecretsRotationFastStrategy } from '../strategies/FastStrategy';
import { SecretsRotationReliableStrategy } from '../strategies/ReliableStrategy';
import { SecretsRotationCachedStrategy } from '../strategies/CachedStrategy';
import { SecretsRotationBatchStrategy } from '../strategies/BatchStrategy';
import { SecretsRotationStrategyFactory } from '../factories/SecretsRotationStrategyFactory';

function createContext(input: unknown): SecretsRotationContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('SecretsRotation Strategies', () => {
  const strategies = [
    { name: 'default', cls: SecretsRotationDefaultStrategy },
    { name: 'fast', cls: SecretsRotationFastStrategy },
    { name: 'reliable', cls: SecretsRotationReliableStrategy },
    { name: 'cached', cls: SecretsRotationCachedStrategy },
    { name: 'batch', cls: SecretsRotationBatchStrategy },
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

  describe('SecretsRotationStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new SecretsRotationStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new SecretsRotationStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new SecretsRotationStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new SecretsRotationStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new SecretsRotationStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
