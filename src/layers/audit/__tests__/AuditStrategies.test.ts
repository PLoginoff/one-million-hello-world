/**
 * Strategy tests for Audit layer
 */

import { AuditContext } from '../types/audit-types';
import { AuditDefaultStrategy } from '../strategies/DefaultStrategy';
import { AuditFastStrategy } from '../strategies/FastStrategy';
import { AuditReliableStrategy } from '../strategies/ReliableStrategy';
import { AuditCachedStrategy } from '../strategies/CachedStrategy';
import { AuditBatchStrategy } from '../strategies/BatchStrategy';
import { AuditStrategyFactory } from '../factories/AuditStrategyFactory';

function createContext(input: unknown): AuditContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Audit Strategies', () => {
  const strategies = [
    { name: 'default', cls: AuditDefaultStrategy },
    { name: 'fast', cls: AuditFastStrategy },
    { name: 'reliable', cls: AuditReliableStrategy },
    { name: 'cached', cls: AuditCachedStrategy },
    { name: 'batch', cls: AuditBatchStrategy },
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

  describe('AuditStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new AuditStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new AuditStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new AuditStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new AuditStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new AuditStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
