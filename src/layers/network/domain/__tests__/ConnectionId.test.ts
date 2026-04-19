/**
 * Connection ID Entity Tests
 * 
 * Unit tests for ConnectionId using AAA pattern.
 */

import { ConnectionId } from '../entities/ConnectionId';

describe('ConnectionId', () => {
  describe('create', () => {
    it('should create a new connection ID', () => {
      const id = ConnectionId.create();
      
      expect(id).toBeDefined();
      expect(id.value).toBeDefined();
      expect(id.value.length).toBeGreaterThan(0);
      expect(id.value.length).toBeLessThanOrEqual(128);
    });

    it('should create unique IDs', () => {
      const id1 = ConnectionId.create();
      const id2 = ConnectionId.create();
      
      expect(id1.equals(id2)).toBe(false);
    });
  });

  describe('fromString', () => {
    it('should create ID from string', () => {
      const id = ConnectionId.fromString('conn_1234567890_abc123');
      
      expect(id.value).toBe('conn_1234567890_abc123');
      expect(id.getPrefix()).toBe('conn');
    });

    it('should throw error for empty string', () => {
      expect(() => ConnectionId.fromString('')).toThrow('Cache key cannot be empty');
    });

    it('should throw error for string exceeding max length', () => {
      const longString = 'a'.repeat(129);
      expect(() => ConnectionId.fromString(longString)).toThrow('Cache key cannot exceed 128 characters');
    });
  });

  describe('withPrefix', () => {
    it('should create ID with custom prefix', () => {
      const id = ConnectionId.withPrefix('custom');
      
      expect(id.getPrefix()).toBe('custom');
      expect(id.value).toMatch(/^custom_/);
    });
  });

  describe('equals', () => {
    it('should return true for equal IDs', () => {
      const id1 = ConnectionId.fromString('test_123');
      const id2 = ConnectionId.fromString('test_123');
      
      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different IDs', () => {
      const id1 = ConnectionId.fromString('test_123');
      const id2 = ConnectionId.fromString('test_456');
      
      expect(id1.equals(id2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return string value', () => {
      const id = ConnectionId.fromString('test_123');
      
      expect(id.toString()).toBe('test_123');
    });
  });

  describe('getHash', () => {
    it('should return consistent hash for same ID', () => {
      const id = ConnectionId.fromString('test_123');
      const hash1 = id.getHash();
      const hash2 = id.getHash();
      
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different IDs', () => {
      const id1 = ConnectionId.fromString('test_123');
      const id2 = ConnectionId.fromString('test_456');
      
      expect(id1.getHash()).not.toBe(id2.getHash());
    });
  });

  describe('getAge', () => {
    it('should return age in milliseconds', () => {
      const id = ConnectionId.create();
      const age = id.getAge();
      
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(100);
    });
  });

  describe('isExpired', () => {
    it('should return false for fresh ID', () => {
      const id = ConnectionId.create();
      
      expect(id.isExpired(10000)).toBe(false);
    });

    it('should return true for old ID', () => {
      const id = ConnectionId.create();
      
      expect(id.isExpired(0)).toBe(true);
    });
  });

  describe('isValid', () => {
    it('should return true for valid ID', () => {
      const id = ConnectionId.create();
      
      expect(id.isValid()).toBe(true);
    });
  });
});
