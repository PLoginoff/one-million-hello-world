/**
 * Strategy tests for Mfa layer
 */

import { MfaContext } from '../types/mfa-types';
import { MfaDefaultStrategy } from '../strategies/DefaultStrategy';
import { MfaFastStrategy } from '../strategies/FastStrategy';
import { MfaReliableStrategy } from '../strategies/ReliableStrategy';
import { MfaCachedStrategy } from '../strategies/CachedStrategy';
import { MfaBatchStrategy } from '../strategies/BatchStrategy';
import { MfaStrategyFactory } from '../factories/MfaStrategyFactory';

function createContext(input: unknown): MfaContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Mfa Strategies', () => {
  const strategies = [
    { name: 'default', cls: MfaDefaultStrategy },
    { name: 'fast', cls: MfaFastStrategy },
    { name: 'reliable', cls: MfaReliableStrategy },
    { name: 'cached', cls: MfaCachedStrategy },
    { name: 'batch', cls: MfaBatchStrategy },
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

  describe('MfaStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new MfaStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new MfaStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new MfaStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new MfaStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new MfaStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
