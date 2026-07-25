/**
 * Strategy tests for ServiceDiscovery layer
 */

import { ServiceDiscoveryContext } from '../types/service-discovery-types';
import { ServiceDiscoveryDefaultStrategy } from '../strategies/DefaultStrategy';
import { ServiceDiscoveryFastStrategy } from '../strategies/FastStrategy';
import { ServiceDiscoveryReliableStrategy } from '../strategies/ReliableStrategy';
import { ServiceDiscoveryCachedStrategy } from '../strategies/CachedStrategy';
import { ServiceDiscoveryBatchStrategy } from '../strategies/BatchStrategy';
import { ServiceDiscoveryStrategyFactory } from '../factories/ServiceDiscoveryStrategyFactory';

function createContext(input: unknown): ServiceDiscoveryContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('ServiceDiscovery Strategies', () => {
  const strategies = [
    { name: 'default', cls: ServiceDiscoveryDefaultStrategy },
    { name: 'fast', cls: ServiceDiscoveryFastStrategy },
    { name: 'reliable', cls: ServiceDiscoveryReliableStrategy },
    { name: 'cached', cls: ServiceDiscoveryCachedStrategy },
    { name: 'batch', cls: ServiceDiscoveryBatchStrategy },
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

  describe('ServiceDiscoveryStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new ServiceDiscoveryStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new ServiceDiscoveryStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new ServiceDiscoveryStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new ServiceDiscoveryStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new ServiceDiscoveryStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
