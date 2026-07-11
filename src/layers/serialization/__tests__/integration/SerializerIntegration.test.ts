/**
 * Serializer Integration Tests
 */

import { SerializerBuilder } from '../../builders/SerializerBuilder';
import { SerializationFormat } from '../../types/serialization-types';

describe('Serializer Integration', () => {
  describe('Basic Serialization', () => {
    it('should serialize and deserialize JSON', async () => {
      const serializer = new SerializerBuilder().build();
      const data = { key: 'value', number: 42 };
      const serialized = await serializer.serialize(data);
      const deserialized = await serializer.deserialize(serialized.data as string);
      expect(deserialized.data).toEqual(data);
    });

    it('should serialize and deserialize XML', async () => {
      const serializer = new SerializerBuilder()
        .withFormat(SerializationFormat.XML)
        .build();
      const data = { key: 'value' };
      const serialized = await serializer.serialize(data);
      const deserialized = await serializer.deserialize(serialized.data as string);
      expect(deserialized.data).toBeDefined();
    });

    it('should serialize and deserialize String', async () => {
      const serializer = new SerializerBuilder()
        .withFormat(SerializationFormat.STRING)
        .build();
      const data = 'test string';
      const serialized = await serializer.serialize(data);
      const deserialized = await serializer.deserialize(serialized.data as string);
      expect(deserialized.data).toBe(data);
    });
  });

  describe('Versioning Integration', () => {
    it('should serialize with version', async () => {
      const serializer = new SerializerBuilder()
        .withVersioning('2.0')
        .build();
      const data = { key: 'value' };
      const serialized = await serializer.serialize(data);
      expect(serialized.data).toBeDefined();
    });
  });

  describe('Validation Integration', () => {
    it('should validate before serialization', async () => {
      const serializer = new SerializerBuilder()
        .withValidation()
        .build();
      const data = { key: 'value' };
      const serialized = await serializer.serialize(data);
      expect(serialized.data).toBeDefined();
    });
  });

  describe('Complex Data', () => {
    it('should serialize nested objects', async () => {
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
      const serialized = await serializer.serialize(data);
      const deserialized = await serializer.deserialize(serialized.data as string);
      expect(deserialized.data).toEqual(data);
    });

    it('should serialize arrays', async () => {
      const serializer = new SerializerBuilder().build();
      const data = [1, 2, 3, 4, 5];
      const serialized = await serializer.serialize(data);
      const deserialized = await serializer.deserialize(serialized.data as string);
      expect(deserialized.data).toEqual(data);
    });

    it('should serialize mixed data', async () => {
      const serializer = new SerializerBuilder().build();
      const data = {
        name: 'test',
        count: 42,
        active: true,
        tags: ['a', 'b', 'c'],
        nested: { value: 123 },
      };
      const serialized = await serializer.serialize(data);
      const deserialized = await serializer.deserialize(serialized.data as string);
      expect(deserialized.data).toEqual(data);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid data gracefully', async () => {
      const serializer = new SerializerBuilder()
        .withStrictMode(false)
        .build();
      await expect(serializer.serialize(undefined)).resolves.not.toThrow();
    });

    it('should handle invalid serialized data', async () => {
      const serializer = new SerializerBuilder().build();
      const result = await serializer.deserialize('invalid json');
      expect(result.success).toBe(false);
    });
  });
});
