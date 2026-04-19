/**
 * EventType Unit Tests
 * 
 * Comprehensive tests for EventType value object.
 * Tests cover validation, categorization, pattern matching, and edge cases.
 */

import { EventType } from '../../domain/value-objects/EventType';

describe('EventType', () => {
  describe('constructor', () => {
    it('should create valid event type', () => {
      const eventType = new EventType('user.created');
      expect(eventType.value).toBe('user.created');
    });

    it('should convert to lowercase', () => {
      const eventType = new EventType('USER.CREATED');
      expect(eventType.value).toBe('user.created');
    });

    it('should trim whitespace', () => {
      const eventType = new EventType('  user.created  ');
      expect(eventType.value).toBe('user.created');
    });

    it('should throw error for empty string', () => {
      expect(() => new EventType('')).toThrow('EventType must be a non-empty string');
    });

    it('should throw error for undefined', () => {
      expect(() => new EventType(undefined as any)).toThrow('EventType must be a non-empty string');
    });

    it('should throw error for non-string value', () => {
      expect(() => new EventType(123 as any)).toThrow('EventType must be a non-empty string');
    });

    it('should throw error for string exceeding max length', () => {
      const longType = 'a'.repeat(101);
      expect(() => new EventType(longType)).toThrow('EventType must not exceed 100 characters');
    });

    it('should throw error for invalid characters (uppercase)', () => {
      expect(() => new EventType('UserCreated')).toThrow('EventType must match pattern');
    });

    it('should throw error for invalid characters (spaces)', () => {
      expect(() => new EventType('user created')).toThrow('EventType must match pattern');
    });

    it('should throw error for invalid characters (underscores)', () => {
      expect(() => new EventType('user_created')).toThrow('EventType must match pattern');
    });

    it('should accept valid pattern with hyphens', () => {
      const eventType = new EventType('user-action');
      expect(eventType.value).toBe('user-action');
    });

    it('should accept valid pattern with dots', () => {
      const eventType = new EventType('user.action.created');
      expect(eventType.value).toBe('user.action.created');
    });

    it('should accept valid pattern with numbers', () => {
      const eventType = new EventType('user123.created');
      expect(eventType.value).toBe('user123.created');
    });

    it('should accept valid pattern with mixed separators', () => {
      const eventType = new EventType('user.action-created.123');
      expect(eventType.value).toBe('user.action-created.123');
    });
  });

  describe('value property', () => {
    it('should return the normalized value', () => {
      const eventType = new EventType('USER.CREATED');
      expect(eventType.value).toBe('user.created');
    });
  });

  describe('category', () => {
    it('should extract category from simple type', () => {
      const eventType = new EventType('user.created');
      expect(eventType.category).toBe('user');
    });

    it('should extract category from nested type', () => {
      const eventType = new EventType('user.profile.updated');
      expect(eventType.category).toBe('user');
    });

    it('should return full type as category for simple type', () => {
      const eventType = new EventType('user');
      expect(eventType.category).toBe('user');
    });

    it('should handle deeply nested types', () => {
      const eventType = new EventType('a.b.c.d.e.f');
      expect(eventType.category).toBe('a');
    });
  });

  describe('subcategory', () => {
    it('should return undefined for simple type', () => {
      const eventType = new EventType('user');
      expect(eventType.subcategory).toBeUndefined();
    });

    it('should extract subcategory from nested type', () => {
      const eventType = new EventType('user.created');
      expect(eventType.subcategory).toBe('created');
    });

    it('should extract full subcategory for deeply nested', () => {
      const eventType = new EventType('user.profile.avatar.updated');
      expect(eventType.subcategory).toBe('profile.avatar.updated');
    });
  });

  describe('isCategory', () => {
    it('should return true for matching category', () => {
      const eventType = new EventType('user.created');
      expect(eventType.isCategory('user')).toBe(true);
    });

    it('should return false for non-matching category', () => {
      const eventType = new EventType('user.created');
      expect(eventType.isCategory('order')).toBe(false);
    });

    it('should be case-sensitive', () => {
      const eventType = new EventType('user.created');
      expect(eventType.isCategory('USER')).toBe(false);
    });
  });

  describe('matches', () => {
    it('should match exact pattern', () => {
      const eventType = new EventType('user.created');
      expect(eventType.matches('user.created')).toBe(true);
    });

    it('should match wildcard pattern', () => {
      const eventType = new EventType('user.created');
      expect(eventType.matches('user.*')).toBe(true);
    });

    it('should match single character wildcard', () => {
      const eventType = new EventType('user.created');
      expect(eventType.matches('user.??????')).toBe(true);
    });

    it('should not match non-matching pattern', () => {
      const eventType = new EventType('user.created');
      expect(eventType.matches('order.*')).toBe(false);
    });

    it('should match multiple wildcards', () => {
      const eventType = new EventType('user.profile.avatar.updated');
      expect(eventType.matches('*.*.*.*')).toBe(true);
    });

    it('should match prefix wildcard', () => {
      const eventType = new EventType('user.created');
      expect(eventType.matches('*.created')).toBe(true);
    });

    it('should match suffix wildcard', () => {
      const eventType = new EventType('user.created');
      expect(eventType.matches('user.*')).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for equal types', () => {
      const type1 = new EventType('user.created');
      const type2 = new EventType('user.created');
      expect(type1.equals(type2)).toBe(true);
    });

    it('should return false for different types', () => {
      const type1 = new EventType('user.created');
      const type2 = new EventType('user.deleted');
      expect(type1.equals(type2)).toBe(false);
    });

    it('should be case-insensitive for equality', () => {
      const type1 = new EventType('user.created');
      const type2 = new EventType('USER.CREATED');
      expect(type1.equals(type2)).toBe(true);
    });

    it('should return false for non-EventType objects', () => {
      const eventType = new EventType('user.created');
      expect(eventType.equals({ value: 'user.created' } as any)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the normalized value', () => {
      const eventType = new EventType('USER.CREATED');
      expect(eventType.toString()).toBe('user.created');
    });
  });

  describe('toJSON', () => {
    it('should return the normalized value', () => {
      const eventType = new EventType('USER.CREATED');
      expect(eventType.toJSON()).toBe('user.created');
    });
  });

  describe('fromString', () => {
    it('should create EventType from string', () => {
      const eventType = EventType.fromString('user.created');
      expect(eventType.value).toBe('user.created');
    });

    it('should throw error for invalid string', () => {
      expect(() => EventType.fromString('')).toThrow();
    });
  });

  describe('create', () => {
    it('should create EventType with category only', () => {
      const eventType = EventType.create('user');
      expect(eventType.value).toBe('user');
      expect(eventType.category).toBe('user');
    });

    it('should create EventType with category and subcategory', () => {
      const eventType = EventType.create('user', 'created');
      expect(eventType.value).toBe('user.created');
      expect(eventType.category).toBe('user');
      expect(eventType.subcategory).toBe('created');
    });

    it('should normalize to lowercase', () => {
      const eventType = EventType.create('USER', 'CREATED');
      expect(eventType.value).toBe('user.created');
    });
  });

  describe('edge cases', () => {
    it('should handle type at max length', () => {
      const type = 'a'.repeat(100);
      const eventType = new EventType(type);
      expect(eventType.value).toBe(type);
    });

    it('should handle type with only numbers', () => {
      const eventType = new EventType('123.456');
      expect(eventType.value).toBe('123.456');
    });

    it('should handle type with only hyphens', () => {
      const eventType = new EventType('a-b-c');
      expect(eventType.value).toBe('a-b-c');
    });
  });
});
