/**
 * Strategy tests for Siem layer
 */

import { SiemContext } from '../types/siem-types';
import { SiemDefaultStrategy } from '../strategies/DefaultStrategy';
import { SiemFastStrategy } from '../strategies/FastStrategy';
import { SiemReliableStrategy } from '../strategies/ReliableStrategy';
import { SiemCachedStrategy } from '../strategies/CachedStrategy';
import { SiemBatchStrategy } from '../strategies/BatchStrategy';
import { SiemStrategyFactory } from '../factories/SiemStrategyFactory';

function createContext(input: unknown): SiemContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Siem Strategies', () => {
  const strategies = [
    { name: 'default', cls: SiemDefaultStrategy },
    { name: 'fast', cls: SiemFastStrategy },
    { name: 'reliable', cls: SiemReliableStrategy },
    { name: 'cached', cls: SiemCachedStrategy },
    { name: 'batch', cls: SiemBatchStrategy },
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

  describe('SiemStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new SiemStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new SiemStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new SiemStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new SiemStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new SiemStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
