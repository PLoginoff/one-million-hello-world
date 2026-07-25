/**
 * Strategy tests for Compression layer
 */

import { CompressionDefaultStrategy } from '../strategies/DefaultStrategy';
import { CompressionFastStrategy } from '../strategies/FastStrategy';
import { CompressionReliableStrategy } from '../strategies/ReliableStrategy';
import { CompressionCachedStrategy } from '../strategies/CachedStrategy';
import { CompressionBatchStrategy } from '../strategies/BatchStrategy';
import { CompressionStrategyFactory } from '../factories/CompressionStrategyFactory';

describe('Compression Strategies', () => {
  const strategies = [
    { name: 'default', cls: CompressionDefaultStrategy },
    { name: 'fast', cls: CompressionFastStrategy },
    { name: 'reliable', cls: CompressionReliableStrategy },
    { name: 'cached', cls: CompressionCachedStrategy },
    { name: 'batch', cls: CompressionBatchStrategy },
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

  describe('CompressionStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new CompressionStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new CompressionStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new CompressionStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new CompressionStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new CompressionStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
