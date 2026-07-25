/**
 * Strategy tests for AnomalyDetection layer
 */

import { AnomalyDetectionContext } from '../types/anomaly-detection-types';
import { AnomalyDetectionDefaultStrategy } from '../strategies/DefaultStrategy';
import { AnomalyDetectionFastStrategy } from '../strategies/FastStrategy';
import { AnomalyDetectionReliableStrategy } from '../strategies/ReliableStrategy';
import { AnomalyDetectionCachedStrategy } from '../strategies/CachedStrategy';
import { AnomalyDetectionBatchStrategy } from '../strategies/BatchStrategy';
import { AnomalyDetectionStrategyFactory } from '../factories/AnomalyDetectionStrategyFactory';

function createContext(input: unknown): AnomalyDetectionContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('AnomalyDetection Strategies', () => {
  const strategies = [
    { name: 'default', cls: AnomalyDetectionDefaultStrategy },
    { name: 'fast', cls: AnomalyDetectionFastStrategy },
    { name: 'reliable', cls: AnomalyDetectionReliableStrategy },
    { name: 'cached', cls: AnomalyDetectionCachedStrategy },
    { name: 'batch', cls: AnomalyDetectionBatchStrategy },
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

  describe('AnomalyDetectionStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new AnomalyDetectionStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new AnomalyDetectionStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new AnomalyDetectionStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new AnomalyDetectionStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new AnomalyDetectionStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
