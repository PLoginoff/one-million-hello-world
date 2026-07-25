/**
 * Strategy tests for HttpParser layer
 */

import { HttpParserDefaultStrategy } from '../strategies/DefaultStrategy';
import { HttpParserFastStrategy } from '../strategies/FastStrategy';
import { HttpParserReliableStrategy } from '../strategies/ReliableStrategy';
import { HttpParserCachedStrategy } from '../strategies/CachedStrategy';
import { HttpParserBatchStrategy } from '../strategies/BatchStrategy';
import { HttpParserStrategyFactory } from '../factories/HttpParserStrategyFactory';

describe('HttpParser Strategies', () => {
  const strategies = [
    { name: 'default', cls: HttpParserDefaultStrategy },
    { name: 'fast', cls: HttpParserFastStrategy },
    { name: 'reliable', cls: HttpParserReliableStrategy },
    { name: 'cached', cls: HttpParserCachedStrategy },
    { name: 'batch', cls: HttpParserBatchStrategy },
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

  describe('HttpParserStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new HttpParserStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new HttpParserStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new HttpParserStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new HttpParserStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new HttpParserStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
