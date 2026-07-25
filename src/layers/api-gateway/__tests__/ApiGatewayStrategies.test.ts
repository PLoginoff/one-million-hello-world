/**
 * Strategy tests for ApiGateway layer
 */

import { ApiGatewayContext } from '../types/api-gateway-types';
import { ApiGatewayDefaultStrategy } from '../strategies/DefaultStrategy';
import { ApiGatewayFastStrategy } from '../strategies/FastStrategy';
import { ApiGatewayReliableStrategy } from '../strategies/ReliableStrategy';
import { ApiGatewayCachedStrategy } from '../strategies/CachedStrategy';
import { ApiGatewayBatchStrategy } from '../strategies/BatchStrategy';
import { ApiGatewayStrategyFactory } from '../factories/ApiGatewayStrategyFactory';

function createContext(input: unknown): ApiGatewayContext {
  return { input: input, metadata: {}, timestamp: new Date() };
}

describe('ApiGateway Strategies', () => {
  const strategies = [
    { name: 'default', cls: ApiGatewayDefaultStrategy },
    { name: 'fast', cls: ApiGatewayFastStrategy },
    { name: 'reliable', cls: ApiGatewayReliableStrategy },
    { name: 'cached', cls: ApiGatewayCachedStrategy },
    { name: 'batch', cls: ApiGatewayBatchStrategy },
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

  describe('ApiGatewayStrategyFactory', () => {
    it('should create default strategy', () => {
      const factory = new ApiGatewayStrategyFactory();
      const strategy = factory.create('default');
      expect(strategy.name).toBe('default');
    });

    it('should create all strategies', () => {
      const factory = new ApiGatewayStrategyFactory();
      const all = factory.createAll();
      expect(all.length).toBe(5);
    });

    it('should list available strategies', () => {
      const factory = new ApiGatewayStrategyFactory();
      const available = factory.getAvailableStrategies();
      expect(available).toContain('default');
      expect(available).toContain('fast');
    });

    it('should throw for unknown strategy', () => {
      const factory = new ApiGatewayStrategyFactory();
      expect(() => factory.create('unknown')).toThrow();
    });

    it('should sort by priority', () => {
      const factory = new ApiGatewayStrategyFactory();
      const sorted = factory.createByPriority();
      expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
    });
  });
});
