/**
 * EventId Unit Tests
 * 
 * Comprehensive tests for EventId value object.
 * Tests cover validation, equality, serialization, and edge cases.
 */

import { EventId } from '../../domain/value-objects/EventId';

describe('EventId', () => {
  describe('constructor', () => {
    it('should generate a valid ID when no value provided', () => {
      const eventId = new EventId();
      expect(eventId.value).toBeDefined();
      expect(typeof eventId.value).toBe('string');
      expect(eventId.value.length).toBeGreaterThanOrEqual(10);
    });

    it('should accept a valid string value', () => {
      const value = 'valid-event-id-123';
      const eventId = new EventId(value);
      expect(eventId.value).toBe(value);
    });

    it('should throw error for empty string', () => {
      expect(() => new EventId('')).toThrow('EventId must be a non-empty string');
    });

    it('should throw error for undefined', () => {
      expect(() => new EventId(undefined as any)).toThrow('EventId must be a non-empty string');
    });

    it('should throw error for non-string value', () => {
      expect(() => new EventId(123 as any)).toThrow('EventId must be a non-empty string');
    });

    it('should throw error for string shorter than 10 characters', () => {
      expect(() => new EventId('short')).toThrow('EventId must be at least 10 characters long');
    });

    it('should accept string exactly 10 characters', () => {
      const eventId = new EventId('1234567890');
      expect(eventId.value).toBe('1234567890');
    });
  });

  describe('value property', () => {
    it('should return the ID value', () => {
      const value = 'test-event-id';
      const eventId = new EventId(value);
      expect(eventId.value).toBe(value);
    });

    it('should be read-only', () => {
      const eventId = new EventId('test-id');
      expect(() => {
        (eventId as any).value = 'new-value';
      }).not.toThrow();
      expect(eventId.value).toBe('test-id');
    });
  });

  describe('equals', () => {
    it('should return true for equal IDs', () => {
      const id1 = new EventId('same-id');
      const id2 = new EventId('same-id');
      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const id1 = new EventId('id-1');
      const id2 = new EventId('id-2');
      expect(id1.equals(id2)).toBe(false);
    });

    it('should return false for non-EventId objects', () => {
      const eventId = new EventId('test-id');
      expect(eventId.equals({ value: 'test-id' } as any)).toBe(false);
    });

    it('should return false for null', () => {
      const eventId = new EventId('test-id');
      expect(eventId.equals(null as any)).toBe(false);
    });

    it('should return false for undefined', () => {
      const eventId = new EventId('test-id');
      expect(eventId.equals(undefined as any)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the string value', () => {
      const value = 'test-event-id';
      const eventId = new EventId(value);
      expect(eventId.toString()).toBe(value);
    });
  });

  describe('toJSON', () => {
    it('should return the string value', () => {
      const value = 'test-event-id';
      const eventId = new EventId(value);
      expect(eventId.toJSON()).toBe(value);
    });
  });

  describe('fromString', () => {
    it('should create EventId from string', () => {
      const value = 'test-event-id';
      const eventId = EventId.fromString(value);
      expect(eventId.value).toBe(value);
    });

    it('should throw error for invalid string', () => {
      expect(() => EventId.fromString('')).toThrow();
    });
  });

  describe('uniqueness', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      const count = 1000;
      
      for (let i = 0; i < count; i++) {
        const eventId = new EventId();
        ids.add(eventId.value);
      }
      
      expect(ids.size).toBe(count);
    });

    it('should generate IDs with timestamp prefix', () => {
      const eventId = new EventId();
      const parts = eventId.value.split('-');
      expect(parts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('edge cases', () => {
    it('should handle very long IDs', () => {
      const longId = 'a'.repeat(1000);
      const eventId = new EventId(longId);
      expect(eventId.value).toBe(longId);
    });

    it('should handle IDs with special characters', () => {
      const specialId = 'event-id_123.456';
      const eventId = new EventId(specialId);
      expect(eventId.value).toBe(specialId);
    });

    it('should handle IDs with unicode characters', () => {
      const unicodeId = 'event-id-тест';
      const eventId = new EventId(unicodeId);
      expect(eventId.value).toBe(unicodeId);
    });
  });
});
