/**
 * CacheKey Unit Tests
 * 
 * Tests for CacheKey entity using AAA pattern.
 */

import { CacheKey } from '../entities/CacheKey';

describe('CacheKey', () => {
  describe('create', () => {
    it('should create key with valid value', () => {
      const key = CacheKey.create('user:123');
      
      expect(key.value).toBe('user:123');
      expect(key.pattern).toBeNull();
    });

    it('should throw error for empty key', () => {
      expect(() => {
        CacheKey.create('');
      }).toThrow('Cache key cannot be empty');
    });

    it('should throw error for whitespace only key', () => {
      expect(() => {
        CacheKey.create('   ');
      }).toThrow('Cache key cannot be empty');
    });

    it('should throw error for key exceeding max length', () => {
      const longKey = 'a'.repeat(256);
      expect(() => {
        CacheKey.create(longKey);
      }).toThrow('Cache key cannot exceed 255 characters');
    });

    it('should accept key at max length', () => {
      const maxKey = 'a'.repeat(255);
      const key = CacheKey.create(maxKey);
      
      expect(key.value).toBe(maxKey);
    });

    it('should accept key with special characters', () => {
      const key = CacheKey.create('user:123@domain.com');
      
      expect(key.value).toBe('user:123@domain.com');
    });
  });

  describe('fromPattern', () => {
    it('should create key with pattern', () => {
      const key = CacheKey.fromPattern('user:*');
      
      expect(key.value).toBe('user:*');
      expect(key.pattern).toBeInstanceOf(RegExp);
    });

    it('should create valid regex pattern', () => {
      const key = CacheKey.fromPattern('user:*');
      
      expect(key.pattern).toBeTruthy();
      expect(key.pattern!.test('user:123')).toBe(true);
      expect(key.pattern!.test('product:123')).toBe(false);
    });

    it('should throw error for empty pattern', () => {
      expect(() => {
        CacheKey.fromPattern('');
      }).toThrow('Cache key cannot be empty');
    });

    it('should throw error for invalid regex pattern', () => {
      expect(() => {
        CacheKey.fromPattern('[invalid');
      }).toThrow();
    });
  });

  describe('matches', () => {
    it('should return true when key matches pattern', () => {
      const key = CacheKey.create('user:123');
      
      expect(key.matches(/user:\d+/)).toBe(true);
    });

    it('should return false when key does not match pattern', () => {
      const key = CacheKey.create('product:123');
      
      expect(key.matches(/user:\d+/)).toBe(false);
    });

    it('should work with pattern key', () => {
      const patternKey = CacheKey.fromPattern('user:*');
      const regularKey = CacheKey.create('user:123');
      
      expect(regularKey.matches(patternKey.pattern!)).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for equal keys', () => {
      const key1 = CacheKey.create('user:123');
      const key2 = CacheKey.create('user:123');
      
      expect(key1.equals(key2)).toBe(true);
    });

    it('should return false for different keys', () => {
      const key1 = CacheKey.create('user:123');
      const key2 = CacheKey.create('user:456');
      
      expect(key1.equals(key2)).toBe(false);
    });

    it('should be case sensitive', () => {
      const key1 = CacheKey.create('User:123');
      const key2 = CacheKey.create('user:123');
      
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return key value as string', () => {
      const key = CacheKey.create('user:123');
      
      expect(key.toString()).toBe('user:123');
    });

    it('should work with pattern key', () => {
      const key = CacheKey.fromPattern('user:*');
      
      expect(key.toString()).toBe('user:*');
    });
  });

  describe('getHash', () => {
    it('should return consistent hash for same key', () => {
      const key = CacheKey.create('user:123');
      const hash1 = key.getHash();
      const hash2 = key.getHash();
      
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different keys', () => {
      const key1 = CacheKey.create('user:123');
      const key2 = CacheKey.create('user:456');
      
      expect(key1.getHash()).not.toBe(key2.getHash());
    });

    it('should return number', () => {
      const key = CacheKey.create('user:123');
      const hash = key.getHash();
      
      expect(typeof hash).toBe('number');
    });
  });

  describe('edge cases', () => {
    it('should handle unicode characters', () => {
      const key = CacheKey.create('用户:123');
      
      expect(key.value).toBe('用户:123');
    });

    it('should handle very short keys', () => {
      const key = CacheKey.create('a');
      
      expect(key.value).toBe('a');
    });

    it('should handle keys with numbers', () => {
      const key = CacheKey.create('123456');
      
      expect(key.value).toBe('123456');
    });

    it('should handle keys with underscores', () => {
      const key = CacheKey.create('user_123_data');
      
      expect(key.value).toBe('user_123_data');
    });
  });
});
