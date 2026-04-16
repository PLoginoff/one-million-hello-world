/**
 * CacheHelper Unit Tests
 * 
 * Tests for CacheHelper using AAA pattern.
 */

import { CacheHelper } from '../helpers/CacheHelper';
import { CacheEntry } from '../../domain/entities/CacheEntry';

describe('CacheHelper', () => {
  describe('calculateSize', () => {
    it('should calculate size of string value', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      const size = CacheHelper.calculateSize(entry);
      expect(size).toBeGreaterThan(0);
    });

    it('should calculate size of object value', () => {
      const entry = new CacheEntry('key1', { data: 'value' }, 60000);
      const size = CacheHelper.calculateSize(entry);
      expect(size).toBeGreaterThan(0);
    });

    it('should calculate size of array value', () => {
      const entry = new CacheEntry('key1', [1, 2, 3], 60000);
      const size = CacheHelper.calculateSize(entry);
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('generateKey', () => {
    it('should generate key from string', () => {
      const key = CacheHelper.generateKey('user', '123');
      expect(key).toBe('user:123');
    });

    it('should generate key from multiple parts', () => {
      const key = CacheHelper.generateKey('user', '123', 'profile');
      expect(key).toBe('user:123:profile');
    });

    it('should handle empty parts', () => {
      const key = CacheHelper.generateKey('user', '', '123');
      expect(key).toContain('123');
    });
  });

  describe('parseKey', () => {
    it('should parse key into parts', () => {
      const parts = CacheHelper.parseKey('user:123:profile');
      expect(parts).toEqual(['user', '123', 'profile']);
    });

    it('should handle single part key', () => {
      const parts = CacheHelper.parseKey('user');
      expect(parts).toEqual(['user']);
    });

    it('should handle empty key', () => {
      const parts = CacheHelper.parseKey('');
      expect(parts).toEqual([]);
    });
  });

  describe('isExpired', () => {
    it('should return false for non-expired entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      expect(CacheHelper.isExpired(entry)).toBe(false);
    });

    it('should return true for expired entry', () => {
      const entry = new CacheEntry('key1', 'value1', 1);
      setTimeout(() => {
        expect(CacheHelper.isExpired(entry)).toBe(true);
      }, 10);
    });

    it('should return false for entry with zero TTL', () => {
      const entry = new CacheEntry('key1', 'value1', 0);
      expect(CacheHelper.isExpired(entry)).toBe(false);
    });
  });

  describe('serialize', () => {
    it('should serialize entry to JSON', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      const serialized = CacheHelper.serialize(entry);
      expect(typeof serialized).toBe('string');
    });

    it('should handle complex values', () => {
      const entry = new CacheEntry('key1', { data: 'value' }, 60000);
      const serialized = CacheHelper.serialize(entry);
      expect(typeof serialized).toBe('string');
    });
  });

  describe('deserialize', () => {
    it('should deserialize entry from JSON', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      const serialized = CacheHelper.serialize(entry);
      const deserialized = CacheHelper.deserialize(serialized);
      expect(deserialized).toBeDefined();
    });

    it('should handle complex values', () => {
      const entry = new CacheEntry('key1', { data: 'value' }, 60000);
      const serialized = CacheHelper.serialize(entry);
      const deserialized = CacheHelper.deserialize(serialized);
      expect(deserialized).toBeDefined();
    });
  });

  describe('formatBytes', () => {
    it('should format bytes to human readable', () => {
      expect(CacheHelper.formatBytes(1024)).toContain('KB');
      expect(CacheHelper.formatBytes(1048576)).toContain('MB');
      expect(CacheHelper.formatBytes(1073741824)).toContain('GB');
    });

    it('should handle zero bytes', () => {
      expect(CacheHelper.formatBytes(0)).toContain('B');
    });
  });

  describe('hashKey', () => {
    it('should generate consistent hash for same key', () => {
      const hash1 = CacheHelper.hashKey('user:123');
      const hash2 = CacheHelper.hashKey('user:123');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different keys', () => {
      const hash1 = CacheHelper.hashKey('user:123');
      const hash2 = CacheHelper.hashKey('user:456');
      expect(hash1).not.toBe(hash2);
    });
  });
});
