/**
 * Strategy Manager Unit Tests
 * 
 * Tests for StrategyManager implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { StrategyManager } from '../implementations/StrategyManager';
import { StrategyType, FeatureFlag } from '../types/strategy-types';

describe('StrategyManager', () => {
  let strategyManager: StrategyManager;

  beforeEach(() => {
    strategyManager = new StrategyManager();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = strategyManager.getConfig();

      expect(config).toBeDefined();
      expect(config.defaultStrategy).toBe(StrategyType.DEFAULT);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        defaultStrategy: StrategyType.EXPERIMENTAL,
        enableABTesting: true,
        enableFeatureFlags: true,
      };

      strategyManager.setConfig(newConfig);
      const config = strategyManager.getConfig();

      expect(config.defaultStrategy).toBe(StrategyType.EXPERIMENTAL);
    });
  });

  describe('execute', () => {
    it('should execute with default strategy', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await strategyManager.execute(operation);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(StrategyType.DEFAULT);
    });

    it('should execute with specified strategy', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await strategyManager.execute(operation, StrategyType.EXPERIMENTAL);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(StrategyType.EXPERIMENTAL);
    });

    it('should handle execution failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'));
      const result = await strategyManager.execute(operation);

      expect(result.success).toBe(false);
    });
  });

  describe('registerFlag', () => {
    it('should register a feature flag', () => {
      const flag: FeatureFlag = {
        name: 'test-flag',
        enabled: true,
        percentage: 100,
      };

      strategyManager.registerFlag(flag);
      const isEnabled = strategyManager.isFlagEnabled('test-flag');

      expect(isEnabled).toBe(false);
    });
  });

  describe('isFlagEnabled', () => {
    it('should return false when feature flags disabled', () => {
      const flag: FeatureFlag = {
        name: 'test-flag',
        enabled: true,
        percentage: 100,
      };

      strategyManager.registerFlag(flag);
      const isEnabled = strategyManager.isFlagEnabled('test-flag');

      expect(isEnabled).toBe(false);
    });

    it('should return true when feature flags enabled and percentage matches', () => {
      strategyManager.setConfig({ defaultStrategy: StrategyType.DEFAULT, enableABTesting: false, enableFeatureFlags: true });
      const flag: FeatureFlag = {
        name: 'test-flag',
        enabled: true,
        percentage: 100,
      };

      strategyManager.registerFlag(flag);
      const isEnabled = strategyManager.isFlagEnabled('test-flag');

      expect(isEnabled).toBe(true);
    });
  });
});
