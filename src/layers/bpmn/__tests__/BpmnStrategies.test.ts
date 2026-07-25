/**
 * Strategy tests for Bpmn layer
 */

import { BpmnContext } from '../types/bpmn-types';
import { BpmnDefaultStrategy } from '../strategies/DefaultStrategy';
import { BpmnFastStrategy } from '../strategies/FastStrategy';
import { BpmnReliableStrategy } from '../strategies/ReliableStrategy';
import { BpmnCachedStrategy } from '../strategies/CachedStrategy';
import { BpmnBatchStrategy } from '../strategies/BatchStrategy';
import { BpmnStrategyFactory } from '../factories/BpmnStrategyFactory';

function createContext(input: unknown): BpmnContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('Bpmn Strategies', () => {
  const strategies = [
    { name: 'default', cls: BpmnDefaultStrategy },
    { name: 'fast', cls: BpmnFastStrategy },
    { name: 'reliable', cls: BpmnReliableStrategy },
    { name: 'cached', cls: BpmnCachedStrategy },
    { name: 'batch', cls: BpmnBatchStrategy },
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

  describe('BpmnStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new BpmnStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new BpmnStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new BpmnStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new BpmnStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new BpmnStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
