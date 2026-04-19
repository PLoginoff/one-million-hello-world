/**
 * EventPayload Unit Tests
 * 
 * Comprehensive tests for EventPayload value object.
 * Tests cover validation, serialization, path access, and edge cases.
 */

import { EventPayload } from '../../domain/value-objects/EventPayload';

describe('EventPayload', () => {
  describe('constructor', () => {
    it('should create payload with data', () => {
      const payload = new EventPayload({ key: 'value' });
      expect(payload.data).toEqual({ key: 'value' });
    });

    it('should accept EventPayload instance', () => {
      const original = new EventPayload({ key: 'value' });
      const payload = new EventPayload(original);
      expect(payload.data).toEqual({ key: 'value' });
    });

    it('should accept schema option', () => {
      const schema = { type: 'object' };
      const payload = new EventPayload({ key: 'value' }, { schema });
      expect(payload.schema).toEqual(schema);
    });

    it('should accept contentType option', () => {
      const payload = new EventPayload({ key: 'value' }, { contentType: 'application/xml' });
      expect(payload.contentType).toBe('application/xml');
    });

    it('should default contentType to application/json', () => {
      const payload = new EventPayload({ key: 'value' });
      expect(payload.contentType).toBe('application/json');
    });

    it('should throw error for undefined data', () => {
      expect(() => new EventPayload(undefined as any)).toThrow(
        'EventPayload: data cannot be undefined'
      );
    });

    it('should accept null data', () => {
      const payload = new EventPayload(null);
      expect(payload.data).toBe(null);
    });

    it('should accept empty object', () => {
      const payload = new EventPayload({});
      expect(payload.data).toEqual({});
    });

    it('should accept empty array', () => {
      const payload = new EventPayload([]);
      expect(payload.data).toEqual([]);
    });

    it('should accept empty string', () => {
      const payload = new EventPayload('');
      expect(payload.data).toBe('');
    });

    it('should accept number 0', () => {
      const payload = new EventPayload(0);
      expect(payload.data).toBe(0);
    });

    it('should accept false boolean', () => {
      const payload = new EventPayload(false);
      expect(payload.data).toBe(false);
    });

    it('should throw error for invalid contentType', () => {
      expect(() => new EventPayload({}, { contentType: 123 as any })).toThrow(
        'EventPayload: contentType must be a string'
      );
    });
  });

  describe('data property', () => {
    it('should return the data', () => {
      const data = { key: 'value' };
      const payload = new EventPayload(data);
      expect(payload.data).toEqual(data);
    });
  });

  describe('schema property', () => {
    it('should return the schema if set', () => {
      const schema = { type: 'object' };
      const payload = new EventPayload({}, { schema });
      expect(payload.schema).toEqual(schema);
    });

    it('should return undefined if not set', () => {
      const payload = new EventPayload({});
      expect(payload.schema).toBeUndefined();
    });
  });

  describe('contentType property', () => {
    it('should return the content type', () => {
      const payload = new EventPayload({}, { contentType: 'text/plain' });
      expect(payload.contentType).toBe('text/plain');
    });
  });

  describe('isEmpty', () => {
    it('should return true for null', () => {
      const payload = new EventPayload(null);
      expect(payload.isEmpty()).toBe(true);
    });

    it('should return true for undefined', () => {
      const payload = new EventPayload(undefined as any);
      expect(payload.isEmpty()).toBe(true);
    });

    it('should return true for empty object', () => {
      const payload = new EventPayload({});
      expect(payload.isEmpty()).toBe(true);
    });

    it('should return true for empty array', () => {
      const payload = new EventPayload([]);
      expect(payload.isEmpty()).toBe(true);
    });

    it('should return true for empty string', () => {
      const payload = new EventPayload('');
      expect(payload.isEmpty()).toBe(true);
    });

    it('should return false for non-empty object', () => {
      const payload = new EventPayload({ key: 'value' });
      expect(payload.isEmpty()).toBe(false);
    });

    it('should return false for non-empty array', () => {
      const payload = new EventPayload([1, 2, 3]);
      expect(payload.isEmpty()).toBe(false);
    });

    it('should return false for non-empty string', () => {
      const payload = new EventPayload('test');
      expect(payload.isEmpty()).toBe(false);
    });

    it('should return false for number', () => {
      const payload = new EventPayload(42);
      expect(payload.isEmpty()).toBe(false);
    });

    it('should return false for boolean', () => {
      const payload = new EventPayload(true);
      expect(payload.isEmpty()).toBe(false);
    });
  });

  describe('getSize', () => {
    it('should return size of object', () => {
      const payload = new EventPayload({ key: 'value' });
      expect(payload.getSize()).toBeGreaterThan(0);
    });

    it('should return size of array', () => {
      const payload = new EventPayload([1, 2, 3]);
      expect(payload.getSize()).toBeGreaterThan(0);
    });

    it('should return size of string', () => {
      const payload = new EventPayload('test');
      expect(payload.getSize()).toBe(4);
    });

    it('should return size of number', () => {
      const payload = new EventPayload(42);
      expect(payload.getSize()).toBe(2);
    });
  });

  describe('getPath', () => {
    it('should get value at path', () => {
      const payload = new EventPayload({ user: { name: 'John' } });
      expect(payload.getPath('user.name')).toBe('John');
    });

    it('should get nested value', () => {
      const payload = new EventPayload({ a: { b: { c: 'value' } } });
      expect(payload.getPath('a.b.c')).toBe('value');
    });

    it('should return undefined for missing path', () => {
      const payload = new EventPayload({ user: { name: 'John' } });
      expect(payload.getPath('user.age')).toBeUndefined();
    });

    it('should return undefined for invalid path', () => {
      const payload = new EventPayload({ user: { name: 'John' } });
      expect(payload.getPath('invalid.path')).toBeUndefined();
    });

    it('should handle null intermediate values', () => {
      const payload = new EventPayload({ user: null });
      expect(payload.getPath('user.name')).toBeUndefined();
    });

    it('should handle undefined intermediate values', () => {
      const payload = new EventPayload({ user: undefined });
      expect(payload.getPath('user.name')).toBeUndefined();
    });

    it('should get array element by index', () => {
      const payload = new EventPayload({ items: ['a', 'b', 'c'] });
      expect(payload.getPath('items.0')).toBe('a');
    });

    it('should get number value', () => {
      const payload = new EventPayload({ count: 42 });
      expect(payload.getPath('count')).toBe(42);
    });

    it('should get boolean value', () => {
      const payload = new EventPayload({ active: true });
      expect(payload.getPath('active')).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for equal payloads', () => {
      const payload1 = new EventPayload({ key: 'value' });
      const payload2 = new EventPayload({ key: 'value' });
      expect(payload1.equals(payload2)).toBe(true);
    });

    it('should return false for different payloads', () => {
      const payload1 = new EventPayload({ key: 'value1' });
      const payload2 = new EventPayload({ key: 'value2' });
      expect(payload1.equals(payload2)).toBe(false);
    });

    it('should return true for equal arrays', () => {
      const payload1 = new EventPayload([1, 2, 3]);
      const payload2 = new EventPayload([1, 2, 3]);
      expect(payload1.equals(payload2)).toBe(true);
    });

    it('should return false for different array orders', () => {
      const payload1 = new EventPayload([1, 2, 3]);
      const payload2 = new EventPayload([3, 2, 1]);
      expect(payload1.equals(payload2)).toBe(false);
    });

    it('should return false for non-EventPayload objects', () => {
      const payload = new EventPayload({ key: 'value' });
      expect(payload.equals({ data: { key: 'value' } } as any)).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should return the data', () => {
      const data = { key: 'value' };
      const payload = new EventPayload(data);
      expect(payload.toJSON()).toEqual(data);
    });
  });

  describe('toString', () => {
    it('should return JSON string', () => {
      const payload = new EventPayload({ key: 'value' });
      expect(payload.toString()).toBe('{"key":"value"}');
    });

    it('should handle string data', () => {
      const payload = new EventPayload('test');
      expect(payload.toString()).toBe('"test"');
    });
  });

  describe('fromJSON', () => {
    it('should create from object', () => {
      const data = { key: 'value' };
      const payload = EventPayload.fromJSON(data);
      expect(payload.data).toEqual(data);
    });

    it('should create from array', () => {
      const data = [1, 2, 3];
      const payload = EventPayload.fromJSON(data);
      expect(payload.data).toEqual(data);
    });
  });

  describe('empty', () => {
    it('should create empty payload', () => {
      const payload = EventPayload.empty<{ key: string }>();
      expect(payload.data).toEqual({});
      expect(payload.isEmpty()).toBe(true);
    });
  });

  describe('fromString', () => {
    it('should parse JSON string', () => {
      const payload = EventPayload.fromString('{"key":"value"}');
      expect(payload.data).toEqual({ key: 'value' });
    });

    it('should parse array string', () => {
      const payload = EventPayload.fromString('[1,2,3]');
      expect(payload.data).toEqual([1, 2, 3]);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => EventPayload.fromString('invalid json')).toThrow(
        'EventPayload: invalid JSON string'
      );
    });
  });

  describe('edge cases', () => {
    it('should handle circular references (should not crash)', () => {
      const data: any = { key: 'value' };
      data.self = data;
      const payload = new EventPayload(data);
      expect(payload.data).toBeDefined();
    });

    it('should handle very large object', () => {
      const largeObj: any = {};
      for (let i = 0; i < 10000; i++) {
        largeObj[`key${i}`] = `value${i}`;
      }
      const payload = new EventPayload(largeObj);
      expect(payload.data).toBeDefined();
    });

    it('should handle special characters in data', () => {
      const payload = new EventPayload({ key: 'value with \n\t\r' });
      expect(payload.data.key).toBe('value with \n\t\r');
    });

    it('should handle unicode characters', () => {
      const payload = new EventPayload({ key: 'тест' });
      expect(payload.data.key).toBe('тест');
    });

    it('should handle nested arrays', () => {
      const payload = new EventPayload({ items: [[1, 2], [3, 4]] });
      expect(payload.getPath('items.0.0')).toBe(1);
    });

    it('should handle mixed types', () => {
      const payload = new EventPayload({
        str: 'string',
        num: 42,
        bool: true,
        arr: [1, 2, 3],
        obj: { nested: 'value' },
        null: null,
      });
      expect(payload.getPath('str')).toBe('string');
      expect(payload.getPath('num')).toBe(42);
      expect(payload.getPath('bool')).toBe(true);
      expect(payload.getPath('arr.0')).toBe(1);
      expect(payload.getPath('obj.nested')).toBe('value');
      expect(payload.getPath('null')).toBe(null);
    });
  });
});
