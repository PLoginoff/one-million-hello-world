/**
 * Strategy tests for ServiceMesh layer
 */

import { ServiceMeshContext } from '../types/service-mesh-types';
import { ServiceMeshDefaultStrategy } from '../strategies/DefaultStrategy';
import { ServiceMeshFastStrategy } from '../strategies/FastStrategy';
import { ServiceMeshReliableStrategy } from '../strategies/ReliableStrategy';
import { ServiceMeshCachedStrategy } from '../strategies/CachedStrategy';
import { ServiceMeshBatchStrategy } from '../strategies/BatchStrategy';
import { ServiceMeshStrategyFactory } from '../factories/ServiceMeshStrategyFactory';

function createContext(input: unknown): ServiceMeshContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('ServiceMesh Strategies', () => {
  const strategies = [
    { name: 'default', cls: ServiceMeshDefaultStrategy },
    { name: 'fast', cls: ServiceMeshFastStrategy },
    { name: 'reliable', cls: ServiceMeshReliableStrategy },
    { name: 'cached', cls: ServiceMeshCachedStrategy },
    { name: 'batch', cls: ServiceMeshBatchStrategy },
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

  describe('ServiceMeshStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new ServiceMeshStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new ServiceMeshStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new ServiceMeshStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new ServiceMeshStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new ServiceMeshStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
