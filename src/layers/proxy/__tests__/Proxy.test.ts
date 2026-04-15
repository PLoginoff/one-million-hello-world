/**
 * Proxy Unit Tests
 * 
 * Tests for Proxy implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Proxy } from '../implementations/Proxy';

describe('Proxy', () => {
  let proxy: Proxy;

  beforeEach(() => {
    proxy = new Proxy();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = proxy.getConfig();

      expect(config).toBeDefined();
      expect(config.enableCaching).toBe(false);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        enableAccessControl: true,
        enableLazyLoading: true,
        enableCaching: true,
      };

      proxy.setConfig(newConfig);
      const config = proxy.getConfig();

      expect(config.enableCaching).toBe(true);
    });
  });

  describe('execute', () => {
    it('should execute operation without caching', async () => {
      const operation = jest.fn().mockResolvedValue('result');
      const result = await proxy.execute(operation, 'key');

      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
      expect(result.fromCache).toBe(false);
    });

    it('should cache result when caching enabled', async () => {
      proxy.setConfig({ enableAccessControl: false, enableLazyLoading: false, enableCaching: true });
      const operation = jest.fn().mockResolvedValue('result');

      await proxy.execute(operation, 'key');
      const result = await proxy.execute(operation, 'key');

      expect(result.success).toBe(true);
      expect(result.fromCache).toBe(true);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle operation failure', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Failed'));
      const result = await proxy.execute(operation, 'key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed');
    });
  });

  describe('clearCache', () => {
    it('should clear specific cache entry', async () => {
      proxy.setConfig({ enableAccessControl: false, enableLazyLoading: false, enableCaching: true });
      const operation = jest.fn().mockResolvedValue('result');

      await proxy.execute(operation, 'key');
      proxy.clearCache('key');
      const result = await proxy.execute(operation, 'key');

      expect(result.fromCache).toBe(false);
    });

    it('should clear all cache', async () => {
      proxy.setConfig({ enableAccessControl: false, enableLazyLoading: false, enableCaching: true });
      const operation = jest.fn().mockResolvedValue('result');

      await proxy.execute(operation, 'key1');
      await proxy.execute(operation, 'key2');
      proxy.clearCache();
      const result = await proxy.execute(operation, 'key1');

      expect(result.fromCache).toBe(false);
    });
  });
});
