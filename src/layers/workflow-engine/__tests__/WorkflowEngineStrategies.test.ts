/**
 * Strategy tests for WorkflowEngine layer
 */

import { WorkflowEngineContext } from '../types/workflow-engine-types';
import { WorkflowEngineDefaultStrategy } from '../strategies/DefaultStrategy';
import { WorkflowEngineFastStrategy } from '../strategies/FastStrategy';
import { WorkflowEngineReliableStrategy } from '../strategies/ReliableStrategy';
import { WorkflowEngineCachedStrategy } from '../strategies/CachedStrategy';
import { WorkflowEngineBatchStrategy } from '../strategies/BatchStrategy';
import { WorkflowEngineStrategyFactory } from '../factories/WorkflowEngineStrategyFactory';

function createContext(input: unknown): WorkflowEngineContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('WorkflowEngine Strategies', () => {
  const strategies = [
    { name: 'default', cls: WorkflowEngineDefaultStrategy },
    { name: 'fast', cls: WorkflowEngineFastStrategy },
    { name: 'reliable', cls: WorkflowEngineReliableStrategy },
    { name: 'cached', cls: WorkflowEngineCachedStrategy },
    { name: 'batch', cls: WorkflowEngineBatchStrategy },
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

  describe('WorkflowEngineStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new WorkflowEngineStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new WorkflowEngineStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new WorkflowEngineStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new WorkflowEngineStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new WorkflowEngineStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
