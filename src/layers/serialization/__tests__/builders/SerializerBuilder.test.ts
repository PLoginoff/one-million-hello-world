/**
 * Serializer Builder Tests
 */

import { SerializerBuilder } from '../../builders/SerializerBuilder';
import { SerializationFormat } from '../../types/serialization-types';

describe('SerializerBuilder', () => {
  describe('Building Serializer', () => {
    it('should build serializer with default config', () => {
      const serializer = new SerializerBuilder().build();
      expect(serializer).toBeDefined();
    });

    it('should build serializer with custom format', () => {
      const serializer = new SerializerBuilder()
        .withFormat(SerializationFormat.XML)
        .build();
      expect(serializer).toBeDefined();
    });

    it('should build serializer with versioning enabled', () => {
      const serializer = new SerializerBuilder()
        .withVersioning('2.0')
        .build();
      expect(serializer).toBeDefined();
    });

    it('should build serializer with validation enabled', () => {
      const serializer = new SerializerBuilder()
        .withValidation()
        .build();
      expect(serializer).toBeDefined();
    });

    it('should build serializer with custom strategy', () => {
      const strategy = new (class {
        serialize() { return ''; }
        deserialize() { return {}; }
        getContentType() { return 'text/plain'; }
        getFormatName() { return 'custom'; }
        canSerialize() { return true; }
        canDeserialize() { return true; }
      })();
      const serializer = new SerializerBuilder()
        .withStrategy('custom', strategy)
        .build();
      expect(serializer).toBeDefined();
    });

    it('should support method chaining', () => {
      const serializer = new SerializerBuilder()
        .withFormat(SerializationFormat.JSON)
        .withVersioning('1.0')
        .withValidation()
        .withPlugins()
        .withHooks()
        .build();
      expect(serializer).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should set strict mode', () => {
      const serializer = new SerializerBuilder()
        .withStrictMode(true)
        .build();
      expect(serializer).toBeDefined();
    });

    it('should set max data size', () => {
      const serializer = new SerializerBuilder()
        .withMaxDataSize(1024)
        .build();
      expect(serializer).toBeDefined();
    });

    it('should set timeout', () => {
      const serializer = new SerializerBuilder()
        .withTimeout(5000)
        .build();
      expect(serializer).toBeDefined();
    });
  });
});
