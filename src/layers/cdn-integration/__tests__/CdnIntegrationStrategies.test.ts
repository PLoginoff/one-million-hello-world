/**
 * Strategy tests for CdnIntegration layer
 */

import { CdnIntegrationContext } from '../types/cdn-integration-types';
import { CdnIntegrationDefaultStrategy } from '../strategies/DefaultStrategy';
import { CdnIntegrationFastStrategy } from '../strategies/FastStrategy';
import { CdnIntegrationReliableStrategy } from '../strategies/ReliableStrategy';
import { CdnIntegrationCachedStrategy } from '../strategies/CachedStrategy';
import { CdnIntegrationBatchStrategy } from '../strategies/BatchStrategy';
import { CdnIntegrationStrategyFactory } from '../factories/CdnIntegrationStrategyFactory';

function createContext(input: unknown): CdnIntegrationContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('CdnIntegration Strategies', () => {
  const strategies = [
    { name: 'default', cls: CdnIntegrationDefaultStrategy },
    { name: 'fast', cls: CdnIntegrationFastStrategy },
    { name: 'reliable', cls: CdnIntegrationReliableStrategy },
    { name: 'cached', cls: CdnIntegrationCachedStrategy },
    { name: 'batch', cls: CdnIntegrationBatchStrategy },
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

  describe('CdnIntegrationStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new CdnIntegrationStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new CdnIntegrationStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new CdnIntegrationStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new CdnIntegrationStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new CdnIntegrationStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
