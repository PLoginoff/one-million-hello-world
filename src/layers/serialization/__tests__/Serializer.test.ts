/**
 * Serializer Unit Tests
 * 
 * Tests for Serializer implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Serializer } from '../implementations/Serializer';
import { ContentType, SerializationFormat } from '../types/serialization-types';
import { CompressionPlugin } from '../plugins/CompressionPlugin';
import { HookType } from '../hooks/SerializationHook';
import { TypeValidator } from '../validation/TypeValidator';

describe('Serializer', () => {
  let serializer: Serializer;

  beforeEach(() => {
    serializer = new Serializer();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = serializer.getConfig();

      expect(config).toBeDefined();
      expect(config.defaultFormat).toBe(SerializationFormat.JSON);
      expect(config.enableVersioning).toBe(false);
      expect(config.enableValidation).toBe(false);
      expect(config.enablePlugins).toBe(true);
      expect(config.enableHooks).toBe(true);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        defaultFormat: SerializationFormat.XML,
        enableVersioning: true,
        currentVersion: '2.0',
        enableValidation: true,
      };

      serializer.setConfig(newConfig);
      const config = serializer.getConfig();

      expect(config.defaultFormat).toBe(SerializationFormat.XML);
      expect(config.enableVersioning).toBe(true);
      expect(config.enableValidation).toBe(true);
    });
  });

  describe('serialize', () => {
    it('should serialize to JSON', async () => {
      const data = { message: 'Hello' };
      const result = await serializer.serialize(data);

      expect(result.success).toBe(true);
      expect(result.contentType).toBe(ContentType.JSON);
      expect(result.data).toBe('{"message":"Hello"}');
    });

    it('should serialize to XML', async () => {
      const data = { message: 'Hello' };
      const result = await serializer.serialize(data, SerializationFormat.XML);

      expect(result.success).toBe(true);
      expect(result.contentType).toBe(ContentType.XML);
      expect(result.data).toContain('<root>');
    });

    it('should serialize to string', async () => {
      const data = 'Hello';
      const result = await serializer.serialize(data, SerializationFormat.STRING);

      expect(result.success).toBe(true);
      expect(result.contentType).toBe(ContentType.PLAIN_TEXT);
      expect(result.data).toBe('Hello');
    });

    it('should add version when enabled', async () => {
      serializer.setConfig({ enableVersioning: true, currentVersion: '1.0' });
      const data = { message: 'Hello' };
      const result = await serializer.serialize(data);

      expect(result.success).toBe(true);
      expect(result.data).toContain('version');
      expect(result.version).toBe('1.0');
    });

    it('should skip plugins when requested', async () => {
      const plugin = new CompressionPlugin(false);
      await serializer.registerPlugin(plugin);
      
      const data = { message: 'Hello' };
      const result = await serializer.serialize(data, SerializationFormat.JSON, { skipPlugins: true });

      expect(result.success).toBe(true);
      expect(result.data).toBe('{"message":"Hello"}');
    });
  });

  describe('deserialize', () => {
    it('should deserialize from JSON', async () => {
      const data = '{"message":"Hello"}';
      const result = await serializer.deserialize<{ message: string }>(data, SerializationFormat.JSON);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ message: 'Hello' });
    });

    it('should deserialize from XML', async () => {
      const data = '<root><message>Hello</message></root>';
      const result = await serializer.deserialize(data, SerializationFormat.XML);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should deserialize string', async () => {
      const data = 'Hello';
      const result = await serializer.deserialize(data, SerializationFormat.STRING);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello');
    });

    it('should handle invalid JSON', async () => {
      const data = '{invalid json}';
      const result = await serializer.deserialize(data, SerializationFormat.JSON);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should extract version when enabled', async () => {
      serializer.setConfig({ enableVersioning: true, currentVersion: '1.0' });
      
      const data = { message: 'Hello' };
      const serialized = await serializer.serialize(data);
      const result = await serializer.deserialize<{ message: string }>(serialized.data!, SerializationFormat.JSON);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ message: 'Hello' });
    });
  });

  describe('negotiateContentType', () => {
    it('should negotiate JSON', () => {
      const result = serializer.negotiateContentType('application/json');

      expect(result).toBe(ContentType.JSON);
    });

    it('should negotiate XML', () => {
      const result = serializer.negotiateContentType('application/xml');

      expect(result).toBe(ContentType.XML);
    });

    it('should default to JSON', () => {
      const result = serializer.negotiateContentType('text/unknown');

      expect(result).toBe(ContentType.JSON);
    });

    it('should handle multiple accept types', () => {
      const result = serializer.negotiateContentType('text/html, application/json');

      expect(result).toBe(ContentType.HTML);
    });

    it('should handle q-values', () => {
      const result = serializer.negotiateContentType('application/xml;q=0.9, application/json;q=1.0');

      expect(result).toBe(ContentType.JSON);
    });
  });

  describe('strategies', () => {
    it('should register custom strategy', () => {
      const mockStrategy = {
        serialize: jest.fn(() => 'custom'),
        deserialize: jest.fn(() => ({})),
        getContentType: () => ContentType.JSON,
        getFormatName: () => 'custom',
        canSerialize: jest.fn(() => true),
        canDeserialize: jest.fn(() => true),
      };

      serializer.registerStrategy('custom', mockStrategy as any);
      const strategy = serializer.getStrategy('custom');

      expect(strategy).toBeDefined();
    });

    it('should return undefined for non-existent strategy', () => {
      const strategy = serializer.getStrategy('nonexistent');
      expect(strategy).toBeUndefined();
    });
  });

  describe('plugins', () => {
    it('should register plugin', async () => {
      const plugin = new CompressionPlugin(false);
      await serializer.registerPlugin(plugin);

      const data = { message: 'Hello' };
      const result = await serializer.serialize(data);

      expect(result.success).toBe(true);
    });

    it('should unregister plugin', async () => {
      const plugin = new CompressionPlugin(false);
      await serializer.registerPlugin(plugin);
      await serializer.unregisterPlugin('compression');

      const data = { message: 'Hello' };
      const result = await serializer.serialize(data);

      expect(result.success).toBe(true);
    });
  });

  describe('hooks', () => {
    it('should register hook', async () => {
      const mockHook = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'test-hook',
      };

      serializer.registerHook(mockHook);

      const data = { message: 'Hello' };
      await serializer.serialize(data);

      expect(mockHook.fn).toHaveBeenCalled();
    });

    it('should unregister hook', async () => {
      const mockHook = {
        type: HookType.BEFORE_SERIALIZE,
        fn: jest.fn((data) => data),
        name: 'test-hook',
      };

      serializer.registerHook(mockHook);
      serializer.unregisterHook(HookType.BEFORE_SERIALIZE, 'test-hook');

      const data = { message: 'Hello' };
      await serializer.serialize(data);

      expect(mockHook.fn).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('should add validator', () => {
      const validator = new TypeValidator('object');
      serializer.addValidator(validator);

      const data = { message: 'Hello' };
      const result = serializer.serialize(data, SerializationFormat.JSON, { validate: true });

      expect(result).resolves.toBeDefined();
    });

    it('should remove validator', () => {
      const validator = new TypeValidator('object');
      serializer.addValidator(validator);
      serializer.removeValidator(validator);
    });
  });

  describe('versioning', () => {
    it('should set versioning strategy', () => {
      const mockStrategy = {
        applyVersioning: jest.fn((data, version) => data),
        extractVersion: jest.fn(() => null),
        getStrategyName: () => 'mock',
        isVersioned: jest.fn(() => false),
      };

      serializer.setVersioningStrategy(mockStrategy as any);
      serializer.setVersioningEnabled(true);

      expect(serializer.getConfig().enableVersioning).toBe(true);
    });

    it('should set current version', () => {
      serializer.setCurrentVersion('2.0');
      expect(serializer.getConfig().currentVersion).toBe('2.0');
    });
  });
});
