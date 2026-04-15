/**
 * Serializer Unit Tests
 * 
 * Tests for Serializer implementation.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { Serializer } from '../implementations/Serializer';
import { ContentType, SerializationFormat } from '../types/serialization-types';

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
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig = {
        defaultFormat: SerializationFormat.XML,
        enableVersioning: true,
        currentVersion: '2.0',
      };

      serializer.setConfig(newConfig);
      const config = serializer.getConfig();

      expect(config.defaultFormat).toBe(SerializationFormat.XML);
      expect(config.enableVersioning).toBe(true);
    });
  });

  describe('serialize', () => {
    it('should serialize to JSON', () => {
      const data = { message: 'Hello' };
      const result = serializer.serialize(data);

      expect(result.success).toBe(true);
      expect(result.contentType).toBe(ContentType.JSON);
      expect(result.data).toBe('{"message":"Hello"}');
    });

    it('should serialize to XML', () => {
      const data = { message: 'Hello' };
      const result = serializer.serialize(data, SerializationFormat.XML);

      expect(result.success).toBe(true);
      expect(result.contentType).toBe(ContentType.XML);
      expect(result.data).toContain('<root>');
    });

    it('should serialize to string', () => {
      const data = 'Hello';
      const result = serializer.serialize(data, SerializationFormat.STRING);

      expect(result.success).toBe(true);
      expect(result.contentType).toBe(ContentType.PLAIN_TEXT);
      expect(result.data).toBe('Hello');
    });

    it('should add version when enabled', () => {
      serializer.setConfig({ defaultFormat: SerializationFormat.JSON, enableVersioning: true, currentVersion: '1.0' });
      const data = { message: 'Hello' };
      const result = serializer.serialize(data);

      expect(result.success).toBe(true);
      expect(result.data).toContain('version');
    });
  });

  describe('deserialize', () => {
    it('should deserialize from JSON', () => {
      const data = '{"message":"Hello"}';
      const result = serializer.deserialize(data, SerializationFormat.JSON);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ message: 'Hello' });
    });

    it('should fail for unsupported format', () => {
      const data = '<root>Hello</root>';
      const result = serializer.deserialize(data, SerializationFormat.XML);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not implemented');
    });

    it('should deserialize string', () => {
      const data = 'Hello';
      const result = serializer.deserialize(data, SerializationFormat.STRING);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Hello');
    });

    it('should handle invalid JSON', () => {
      const data = '{invalid json}';
      const result = serializer.deserialize(data, SerializationFormat.JSON);

      expect(result.success).toBe(false);
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
  });
});
