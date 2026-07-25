/**
 * Strategy tests for BotDetection layer
 */

import { BotDetectionContext } from '../types/bot-detection-types';
import { BotDetectionDefaultStrategy } from '../strategies/DefaultStrategy';
import { BotDetectionFastStrategy } from '../strategies/FastStrategy';
import { BotDetectionReliableStrategy } from '../strategies/ReliableStrategy';
import { BotDetectionCachedStrategy } from '../strategies/CachedStrategy';
import { BotDetectionBatchStrategy } from '../strategies/BatchStrategy';
import { BotDetectionStrategyFactory } from '../factories/BotDetectionStrategyFactory';

function createContext(input: unknown): BotDetectionContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('BotDetection Strategies', () => {
  const strategies = [
    { name: 'default', cls: BotDetectionDefaultStrategy },
    { name: 'fast', cls: BotDetectionFastStrategy },
    { name: 'reliable', cls: BotDetectionReliableStrategy },
    { name: 'cached', cls: BotDetectionCachedStrategy },
    { name: 'batch', cls: BotDetectionBatchStrategy },
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

  describe('BotDetectionStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new BotDetectionStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new BotDetectionStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new BotDetectionStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new BotDetectionStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new BotDetectionStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
