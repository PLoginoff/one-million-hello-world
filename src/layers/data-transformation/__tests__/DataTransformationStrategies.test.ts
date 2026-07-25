/**
 * Strategy tests for DataTransformation layer
 */

import { DataTransformationDefaultStrategy } from '../strategies/DefaultStrategy';
import { DataTransformationFastStrategy } from '../strategies/FastStrategy';
import { DataTransformationReliableStrategy } from '../strategies/ReliableStrategy';
import { DataTransformationCachedStrategy } from '../strategies/CachedStrategy';
import { DataTransformationBatchStrategy } from '../strategies/BatchStrategy';
import { DataTransformationStrategyFactory } from '../factories/DataTransformationStrategyFactory';

describe('DataTransformation Strategies', () => {
  const strategies = [
    { name: 'default', cls: DataTransformationDefaultStrategy },
    { name: 'fast', cls: DataTransformationFastStrategy },
    { name: 'reliable', cls: DataTransformationReliableStrategy },
    { name: 'cached', cls: DataTransformationCachedStrategy },
    { name: 'batch', cls: DataTransformationBatchStrategy },
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
        const result = await strategy.execute('test');
        expect(result.success).toBe(true);
      });

      it('should track execution count', async () => {
        const strategy = new s.cls();
        await strategy.execute(1);
        await strategy.execute(2);
        await strategy.execute(3);
        expect(strategy.getExecutionCount()).toBe(3);
      });
    });
  });

  describe('DataTransformationStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new DataTransformationStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new DataTransformationStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new DataTransformationStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new DataTransformationStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new DataTransformationStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
