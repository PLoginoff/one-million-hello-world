/**
 * Strategy tests for BlueGreenDeploy layer
 */

import { BlueGreenDeployContext } from '../types/blue-green-deploy-types';
import { BlueGreenDeployDefaultStrategy } from '../strategies/DefaultStrategy';
import { BlueGreenDeployFastStrategy } from '../strategies/FastStrategy';
import { BlueGreenDeployReliableStrategy } from '../strategies/ReliableStrategy';
import { BlueGreenDeployCachedStrategy } from '../strategies/CachedStrategy';
import { BlueGreenDeployBatchStrategy } from '../strategies/BatchStrategy';
import { BlueGreenDeployStrategyFactory } from '../factories/BlueGreenDeployStrategyFactory';

function createContext(input: unknown): BlueGreenDeployContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('BlueGreenDeploy Strategies', () => {
  const strategies = [
    { name: 'default', cls: BlueGreenDeployDefaultStrategy },
    { name: 'fast', cls: BlueGreenDeployFastStrategy },
    { name: 'reliable', cls: BlueGreenDeployReliableStrategy },
    { name: 'cached', cls: BlueGreenDeployCachedStrategy },
    { name: 'batch', cls: BlueGreenDeployBatchStrategy },
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

  describe('BlueGreenDeployStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new BlueGreenDeployStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new BlueGreenDeployStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new BlueGreenDeployStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new BlueGreenDeployStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new BlueGreenDeployStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
