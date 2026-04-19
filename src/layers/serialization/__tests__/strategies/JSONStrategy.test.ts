/**
 * JSON Strategy Unit Tests
 */

import { JSONStrategy } from '../../strategies/JSONStrategy';
import { ContentType } from '../../types/serialization-types';

describe('JSONStrategy', () => {
  let strategy: JSONStrategy;

  beforeEach(() => {
    strategy = new JSONStrategy();
  });

  describe('serialize', () => {
    it('should serialize object to JSON string', () => {
      const data = { message: 'Hello', value: 42 };
      const result = strategy.serialize(data);

      expect(result).toBe('{"message":"Hello","value":42}');
    });

    it('should serialize array to JSON string', () => {
      const data = [1, 2, 3];
      const result = strategy.serialize(data);

      expect(result).toBe('[1,2,3]');
    });

    it('should serialize string to JSON string', () => {
      const data = 'Hello';
      const result = strategy.serialize(data);

      expect(result).toBe('"Hello"');
    });

    it('should serialize number to JSON string', () => {
      const data = 42;
      const result = strategy.serialize(data);

      expect(result).toBe('42');
    });

    it('should serialize boolean to JSON string', () => {
      const data = true;
      const result = strategy.serialize(data);

      expect(result).toBe('true');
    });

    it('should serialize null to JSON string', () => {
      const data = null;
      const result = strategy.serialize(data);

      expect(result).toBe('null');
    });

    it('should serialize nested objects', () => {
      const data = { user: { name: 'John', age: 30 } };
      const result = strategy.serialize(data);

      expect(result).toBe('{"user":{"name":"John","age":30}}');
    });
  });

  describe('deserialize', () => {
    it('should deserialize JSON string to object', () => {
      const data = '{"message":"Hello","value":42}';
      const result = strategy.deserialize(data);

      expect(result).toEqual({ message: 'Hello', value: 42 });
    });

    it('should deserialize JSON string to array', () => {
      const data = '[1,2,3]';
      const result = strategy.deserialize(data);

      expect(result).toEqual([1, 2, 3]);
    });

    it('should deserialize JSON string to string', () => {
      const data = '"Hello"';
      const result = strategy.deserialize(data);

      expect(result).toBe('Hello');
    });

    it('should deserialize JSON string to number', () => {
      const data = '42';
      const result = strategy.deserialize(data);

      expect(result).toBe(42);
    });

    it('should deserialize JSON string to boolean', () => {
      const data = 'true';
      const result = strategy.deserialize(data);

      expect(result).toBe(true);
    });

    it('should deserialize nested objects', () => {
      const data = '{"user":{"name":"John","age":30}}';
      const result = strategy.deserialize(data);

      expect(result).toEqual({ user: { name: 'John', age: 30 } });
    });

    it('should throw on invalid JSON', () => {
      const data = '{invalid json}';
      expect(() => strategy.deserialize(data)).toThrow();
    });
  });

  describe('getContentType', () => {
    it('should return JSON content type', () => {
      expect(strategy.getContentType()).toBe(ContentType.JSON);
    });
  });

  describe('getFormatName', () => {
    it('should return format name', () => {
      expect(strategy.getFormatName()).toBe('json');
    });
  });

  describe('canSerialize', () => {
    it('should return true for serializable data', () => {
      expect(strategy.canSerialize({})).toBe(true);
      expect(strategy.canSerialize([])).toBe(true);
      expect(strategy.canSerialize('')).toBe(true);
      expect(strategy.canSerialize(42)).toBe(true);
      expect(strategy.canSerialize(true)).toBe(true);
      expect(strategy.canSerialize(null)).toBe(true);
    });

    it('should return true for circular reference (but will throw on serialize)', () => {
      const obj: any = {};
      obj.self = obj;
      expect(strategy.canSerialize(obj)).toBe(false);
    });
  });

  describe('canDeserialize', () => {
    it('should return true for valid JSON', () => {
      expect(strategy.canDeserialize('{}')).toBe(true);
      expect(strategy.canDeserialize('[]')).toBe(true);
      expect(strategy.canDeserialize('42')).toBe(true);
      expect(strategy.canDeserialize('"text"')).toBe(true);
      expect(strategy.canDeserialize('true')).toBe(true);
      expect(strategy.canDeserialize('null')).toBe(true);
    });

    it('should return false for invalid JSON', () => {
      expect(strategy.canDeserialize('{invalid}')).toBe(false);
      expect(strategy.canDeserialize('not json')).toBe(false);
    });
  });
});
