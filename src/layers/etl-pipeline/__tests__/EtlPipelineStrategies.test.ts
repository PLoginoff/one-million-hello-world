/**
 * Strategy tests for EtlPipeline layer
 */

import { EtlPipelineContext } from '../types/etl-pipeline-types';
import { EtlPipelineDefaultStrategy } from '../strategies/DefaultStrategy';
import { EtlPipelineFastStrategy } from '../strategies/FastStrategy';
import { EtlPipelineReliableStrategy } from '../strategies/ReliableStrategy';
import { EtlPipelineCachedStrategy } from '../strategies/CachedStrategy';
import { EtlPipelineBatchStrategy } from '../strategies/BatchStrategy';
import { EtlPipelineStrategyFactory } from '../factories/EtlPipelineStrategyFactory';

function createContext(input: unknown): EtlPipelineContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('EtlPipeline Strategies', () => {
  const strategies = [
    { name: 'default', cls: EtlPipelineDefaultStrategy },
    { name: 'fast', cls: EtlPipelineFastStrategy },
    { name: 'reliable', cls: EtlPipelineReliableStrategy },
    { name: 'cached', cls: EtlPipelineCachedStrategy },
    { name: 'batch', cls: EtlPipelineBatchStrategy },
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

  describe('EtlPipelineStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new EtlPipelineStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new EtlPipelineStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new EtlPipelineStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new EtlPipelineStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new EtlPipelineStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
