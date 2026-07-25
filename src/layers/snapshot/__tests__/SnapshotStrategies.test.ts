/**
 * Strategy tests for Snapshot layer
 */

import { SnapshotContext } from '../types/snapshot-types';
import { SnapshotDefaultStrategy } from '../strategies/DefaultStrategy';
import { SnapshotFastStrategy } from '../strategies/FastStrategy';
import { SnapshotReliableStrategy } from '../strategies/ReliableStrategy';
import { SnapshotCachedStrategy } from '../strategies/CachedStrategy';
import { SnapshotBatchStrategy } from '../strategies/BatchStrategy';
import { SnapshotStrategyFactory } from '../factories/SnapshotStrategyFactory';

function createContext(input: unknown): SnapshotContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Snapshot Strategies', () => {
  const strategies = [
    { name: 'default', cls: SnapshotDefaultStrategy },
    { name: 'fast', cls: SnapshotFastStrategy },
    { name: 'reliable', cls: SnapshotReliableStrategy },
    { name: 'cached', cls: SnapshotCachedStrategy },
    { name: 'batch', cls: SnapshotBatchStrategy },
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

  describe('SnapshotStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new SnapshotStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new SnapshotStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new SnapshotStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new SnapshotStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new SnapshotStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
