/**
 * Strategy tests for Migrations layer
 */

import { MigrationsContext } from '../types/migrations-types';
import { MigrationsDefaultStrategy } from '../strategies/DefaultStrategy';
import { MigrationsFastStrategy } from '../strategies/FastStrategy';
import { MigrationsReliableStrategy } from '../strategies/ReliableStrategy';
import { MigrationsCachedStrategy } from '../strategies/CachedStrategy';
import { MigrationsBatchStrategy } from '../strategies/BatchStrategy';
import { MigrationsStrategyFactory } from '../factories/MigrationsStrategyFactory';

function createContext(input: unknown): MigrationsContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Migrations Strategies', () => {
  const strategies = [
    { name: 'default', cls: MigrationsDefaultStrategy },
    { name: 'fast', cls: MigrationsFastStrategy },
    { name: 'reliable', cls: MigrationsReliableStrategy },
    { name: 'cached', cls: MigrationsCachedStrategy },
    { name: 'batch', cls: MigrationsBatchStrategy },
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

  describe('MigrationsStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new MigrationsStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new MigrationsStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new MigrationsStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new MigrationsStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new MigrationsStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
