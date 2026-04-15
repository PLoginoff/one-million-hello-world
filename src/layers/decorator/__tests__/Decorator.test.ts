/**
 * Decorator Unit Tests
 * 
 * Tests for Decorator implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Decorator } from '../implementations/Decorator';

describe('Decorator', () => {
  let decorator: Decorator;

  beforeEach(() => {
    decorator = new Decorator();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = decorator.getConfig();

      expect(config).toBeDefined();
      expect(config.enableLogging).toBe(false);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableLogging: true,
        enableMetrics: true,
      };

      decorator.setConfig(newConfig);
      const config = decorator.getConfig();

      expect(config.enableLogging).toBe(true);
    });
  });

  describe('execute', () => {
    it('should execute operation without decorators', async () => {
      const operation = jest.fn().mockResolvedValue('result');
      const result = await decorator.execute(operation, []);

      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
      expect(result.decorators).toEqual([]);
    });

    it('should apply logging decorator when enabled', async () => {
      decorator.setConfig({ enableLogging: true, enableMetrics: false });
      const operation = jest.fn().mockResolvedValue('result');
      const result = await decorator.execute(operation, []);

      expect(result.success).toBe(true);
      expect(result.decorators).toContain('logging');
    });

    it('should apply metrics decorator when enabled', async () => {
      decorator.setConfig({ enableLogging: false, enableMetrics: true });
      const operation = jest.fn().mockResolvedValue('result');
      const result = await decorator.execute(operation, []);

      expect(result.success).toBe(true);
      expect(result.decorators).toContain('metrics');
    });

    it('should handle operation failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'));
      const result = await decorator.execute(operation, []);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed');
    });
  });
});
