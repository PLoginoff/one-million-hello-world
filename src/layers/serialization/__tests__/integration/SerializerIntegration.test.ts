/**
 * Serializer Integration Tests
 */

import { SerializerBuilder } from '../../builders/SerializerBuilder';
import { SerializationFormat } from '../../types/serialization-types';

describe('Serializer Integration', () => {
  describe('Basic Serialization', () => {
    it('should serialize and deserialize JSON', () => {
      const serializer = new SerializerBuilder().build();
      const data = { key: 'value', number: 42 };
      const serialized = serializer.serialize(data);
      const deserialized = serializer.deserialize(serialized);
      expect(deserialized).toEqual(data);
    });

    it('should serialize and deserialize XML', () => {
      const serializer = new SerializerBuilder()
        .withFormat(SerializationFormat.XML)
        .build();
      const data = { key: 'value' };
      const serialized = serializer.serialize(data);
      const deserialized = serializer.deserialize(serialized);
      expect(deserialized).toBeDefined();
    });

    it('should serialize and deserialize String', () => {
      const serializer = new SerializerBuilder()
        .withFormat(SerializationFormat.STRING)
        .build();
      const data = 'test string';
      const serialized = serializer.serialize(data);
      const deserialized = serializer.deserialize(serialized);
      expect(deserialized).toBe(data);
    });
  });

  describe('Versioning Integration', () => {
    it('should serialize with version', () => {
      const serializer = new SerializerBuilder()
        .withVersioning('2.0')
        .build();
      const data = { key: 'value' };
      const serialized = serializer.serialize(data);
      expect(serialized).toBeDefined();
    });
  });

  describe('Validation Integration', () => {
    it('should validate before serialization', () => {
      const serializer = new SerializerBuilder()
        .withValidation()
        .build();
      const data = { key: 'value' };
      const serialized = serializer.serialize(data);
      expect(serialized).toBeDefined();
    });
  });

  describe('Complex Data', () => {
    it('should serialize nested objects', () => {
      const serializer = new SerializerBuilder().build();
      const data = {
        user: {
          name: 'John',
          age: 30,
          address: {
            city: 'New York',
            country: 'USA',
          },
        },
      };
      const serialized = serializer.serialize(data);
      const deserialized = serializer.deserialize(serialized);
      expect(deserialized).toEqual(data);
    });

    it('should serialize arrays', () => {
      const serializer = new SerializerBuilder().build();
      const data = [1, 2, 3, 4, 5];
      const serialized = serializer.serialize(data);
      const deserialized = serializer.deserialize(serialized);
      expect(deserialized).toEqual(data);
    });

    it('should serialize mixed data', () => {
      const serializer = new SerializerBuilder().build();
      const data = {
        name: 'test',
        count: 42,
        active: true,
        tags: ['a', 'b', 'c'],
        nested: { value: 123 },
      };
      const serialized = serializer.serialize(data);
      const deserialized = serializer.deserialize(serialized);
      expect(deserialized).toEqual(data);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid data gracefully', () => {
      const serializer = new SerializerBuilder()
        .withStrictMode(false)
        .build();
      expect(() => serializer.serialize(undefined)).not.toThrow();
    });

    it('should handle invalid serialized data', () => {
      const serializer = new SerializerBuilder().build();
      expect(() => serializer.deserialize('invalid json')).toThrow();
    });
  });
});
