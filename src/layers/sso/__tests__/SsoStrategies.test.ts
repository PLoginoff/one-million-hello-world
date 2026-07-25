/**
 * Strategy tests for Sso layer
 */

import { SsoContext } from '../types/sso-types';
import { SsoDefaultStrategy } from '../strategies/DefaultStrategy';
import { SsoFastStrategy } from '../strategies/FastStrategy';
import { SsoReliableStrategy } from '../strategies/ReliableStrategy';
import { SsoCachedStrategy } from '../strategies/CachedStrategy';
import { SsoBatchStrategy } from '../strategies/BatchStrategy';
import { SsoStrategyFactory } from '../factories/SsoStrategyFactory';

function createContext(input: unknown): SsoContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Sso Strategies', () => {
  const strategies = [
    { name: 'default', cls: SsoDefaultStrategy },
    { name: 'fast', cls: SsoFastStrategy },
    { name: 'reliable', cls: SsoReliableStrategy },
    { name: 'cached', cls: SsoCachedStrategy },
    { name: 'batch', cls: SsoBatchStrategy },
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

  describe('SsoStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new SsoStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new SsoStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new SsoStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new SsoStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new SsoStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
