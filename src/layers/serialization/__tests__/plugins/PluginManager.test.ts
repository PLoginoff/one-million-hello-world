/**
 * Plugin Manager Unit Tests
 */

import { PluginManager } from '../../plugins/PluginManager';
import { ISerializationPlugin } from '../../plugins/ISerializationPlugin';
import { CompressionPlugin } from '../../plugins/CompressionPlugin';

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe('registerPlugin', () => {
    it('should register plugin', async () => {
      const plugin = new CompressionPlugin(false);
      await manager.registerPlugin(plugin);

      const registeredPlugins = manager.getAllPlugins();
      expect(registeredPlugins).toHaveLength(1);
      expect(registeredPlugins[0]).toBe(plugin);
    });

    it('should call plugin lifecycle on register', async () => {
      const plugin = new CompressionPlugin(false);
      const initializeSpy = jest.spyOn(plugin, 'initialize' as any);

      await manager.registerPlugin(plugin);

      expect(initializeSpy).toHaveBeenCalled();
    });

    it('should register multiple plugins', async () => {
      const plugin1 = new CompressionPlugin(false);
      const plugin2 = new CompressionPlugin(false);

      await manager.registerPlugin(plugin1);
      await manager.registerPlugin(plugin2);

      expect(manager.getAllPlugins()).toHaveLength(2);
    });
  });

  describe('unregisterPlugin', () => {
    it('should unregister plugin by name', async () => {
      const plugin = new CompressionPlugin(false);
      await manager.registerPlugin(plugin);
      await manager.unregisterPlugin('compression');

      expect(manager.getAllPlugins()).toHaveLength(0);
    });

    it('should call plugin lifecycle on unregister', async () => {
      const plugin = new CompressionPlugin(false);
      await manager.registerPlugin(plugin);
      const cleanupSpy = jest.spyOn(plugin, 'cleanup');

      await manager.unregisterPlugin('compression');

      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should handle unregistering non-existent plugin', async () => {
      await expect(manager.unregisterPlugin('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('executeBeforeSerialize', () => {
    it('should execute beforeSerialize hooks on all plugins', async () => {
      const plugin = new CompressionPlugin(false);
      await manager.registerPlugin(plugin);

      const data = { message: 'Hello' };
      const result = await manager.executeBeforeSerialize(data);

      expect(result).toBeDefined();
    });

    it('should pass data through plugins in order', async () => {
      const plugin1 = new CompressionPlugin(false);
      const plugin2 = new CompressionPlugin(false);

      await manager.registerPlugin(plugin1);
      await manager.registerPlugin(plugin2);

      const data = { message: 'Hello' };
      const result = await manager.executeBeforeSerialize(data);

      expect(result).toBeDefined();
    });

    it('should handle no plugins', async () => {
      const data = { message: 'Hello' };
      const result = await manager.executeBeforeSerialize(data);

      expect(result).toEqual(data);
    });
  });

  describe('executeAfterSerialize', () => {
    it('should execute afterSerialize hooks on all plugins', async () => {
      const plugin = new CompressionPlugin(false);
      await manager.registerPlugin(plugin);

      const data = '{"message":"Hello"}';
      const result = await manager.executeAfterSerialize(data);

      expect(result).toBeDefined();
    });

    it('should handle no plugins', async () => {
      const data = '{"message":"Hello"}';
      const result = await manager.executeAfterSerialize(data);

      expect(result).toEqual(data);
    });
  });

  describe('executeBeforeDeserialize', () => {
    it('should execute beforeDeserialize hooks on all plugins', async () => {
      const plugin = new CompressionPlugin(false);
      await manager.registerPlugin(plugin);

      const data = '{"message":"Hello"}';
      const result = await manager.executeBeforeDeserialize(data);

      expect(result).toBeDefined();
    });

    it('should handle no plugins', async () => {
      const data = '{"message":"Hello"}';
      const result = await manager.executeBeforeDeserialize(data);

      expect(result).toEqual(data);
    });
  });

  describe('executeAfterDeserialize', () => {
    it('should execute afterDeserialize hooks on all plugins', async () => {
      const plugin = new CompressionPlugin(false);
      await manager.registerPlugin(plugin);

      const data = { message: 'Hello' };
      const result = await manager.executeAfterDeserialize(data);

      expect(result).toBeDefined();
    });

    it('should handle no plugins', async () => {
      const data = { message: 'Hello' };
      const result = await manager.executeAfterDeserialize(data);

      expect(result).toEqual(data);
    });
  });

  describe('getPlugin', () => {
    it('should get plugin by name', async () => {
      const plugin = new CompressionPlugin(false);
      await manager.registerPlugin(plugin);

      const retrievedPlugin = manager.getPlugin('compression');
      expect(retrievedPlugin).toBe(plugin);
    });

    it('should return undefined for non-existent plugin', () => {
      const plugin = manager.getPlugin('nonexistent');
      expect(plugin).toBeUndefined();
    });
  });

  describe('getPlugins', () => {
    it('should return all registered plugins', async () => {
      const plugin1 = new CompressionPlugin(false);
      const plugin2 = new CompressionPlugin(false);

      await manager.registerPlugin(plugin1);
      await manager.registerPlugin(plugin2);

      const plugins = manager.getPlugins();
      expect(plugins).toHaveLength(2);
      expect(plugins).toContain(plugin1);
      expect(plugins).toContain(plugin2);
    });

    it('should return empty array when no plugins', () => {
      const plugins = manager.getPlugins();
      expect(plugins).toHaveLength(0);
    });
  });

  describe('clearPlugins', () => {
    it('should remove all plugins', async () => {
      const plugin1 = new CompressionPlugin(false);
      const plugin2 = new CompressionPlugin(false);

      await manager.registerPlugin(plugin1);
      await manager.registerPlugin(plugin2);
      await manager.clear();

      expect(manager.getAllPlugins()).toHaveLength(0);
    });
  });
});
