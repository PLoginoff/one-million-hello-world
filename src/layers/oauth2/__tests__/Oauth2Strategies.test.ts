/**
 * Strategy tests for Oauth2 layer
 */

import { Oauth2Context } from '../types/oauth2-types';
import { Oauth2DefaultStrategy } from '../strategies/DefaultStrategy';
import { Oauth2FastStrategy } from '../strategies/FastStrategy';
import { Oauth2ReliableStrategy } from '../strategies/ReliableStrategy';
import { Oauth2CachedStrategy } from '../strategies/CachedStrategy';
import { Oauth2BatchStrategy } from '../strategies/BatchStrategy';
import { Oauth2StrategyFactory } from '../factories/Oauth2StrategyFactory';

function createContext(input: unknown): Oauth2Context {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Oauth2 Strategies', () => {
  const strategies = [
    { name: 'default', cls: Oauth2DefaultStrategy },
    { name: 'fast', cls: Oauth2FastStrategy },
    { name: 'reliable', cls: Oauth2ReliableStrategy },
    { name: 'cached', cls: Oauth2CachedStrategy },
    { name: 'batch', cls: Oauth2BatchStrategy },
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

  describe('Oauth2StrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new Oauth2StrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new Oauth2StrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new Oauth2StrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new Oauth2StrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new Oauth2StrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
