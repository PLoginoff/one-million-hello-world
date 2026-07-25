/**
 * Strategy tests for Encryption layer
 */

import { EncryptionContext } from '../types/encryption-types';
import { EncryptionDefaultStrategy } from '../strategies/DefaultStrategy';
import { EncryptionFastStrategy } from '../strategies/FastStrategy';
import { EncryptionReliableStrategy } from '../strategies/ReliableStrategy';
import { EncryptionCachedStrategy } from '../strategies/CachedStrategy';
import { EncryptionBatchStrategy } from '../strategies/BatchStrategy';
import { EncryptionStrategyFactory } from '../factories/EncryptionStrategyFactory';

function createContext(input: unknown): EncryptionContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Encryption Strategies', () => {
  const strategies = [
    { name: 'default', cls: EncryptionDefaultStrategy },
    { name: 'fast', cls: EncryptionFastStrategy },
    { name: 'reliable', cls: EncryptionReliableStrategy },
    { name: 'cached', cls: EncryptionCachedStrategy },
    { name: 'batch', cls: EncryptionBatchStrategy },
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

  describe('EncryptionStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new EncryptionStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new EncryptionStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new EncryptionStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new EncryptionStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new EncryptionStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
