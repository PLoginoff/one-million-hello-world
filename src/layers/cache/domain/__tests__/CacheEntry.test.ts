/**
 * CacheEntry Unit Tests
 * 
 * Tests for CacheEntry entity using AAA pattern.
 */

import { CacheEntry } from '../entities/CacheEntry';

describe('CacheEntry', () => {
  describe('constructor', () => {
    it('should create entry with valid data', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      
      expect(entry.key).toBe('key1');
      expect(entry.value).toBe('value1');
      expect(entry.ttl).toBe(60000);
      expect(entry.createdAt).toBeGreaterThan(0);
      expect(entry.accessCount).toBe(0);
    });

    it('should create entry with zero TTL', () => {
      const entry = new CacheEntry('key1', 'value1', 0);
      
      expect(entry.ttl).toBe(0);
    });

    it('should create entry with large TTL', () => {
      const entry = new CacheEntry('key1', 'value1', 86400000);
      
      expect(entry.ttl).toBe(86400000);
    });
  });

  describe('isExpired', () => {
    it('should return false for non-expired entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      const currentTime = entry.createdAt + 30000;
      
      expect(entry.isExpired(currentTime)).toBe(false);
    });

    it('should return true for expired entry', () => {
      const entry = new CacheEntry('key1', 'value1', 100);
      const currentTime = entry.createdAt + 150;
      
      expect(entry.isExpired(currentTime)).toBe(true);
    });

    it('should return false for entry with zero TTL', () => {
      const entry = new CacheEntry('key1', 'value1', 0);
      const currentTime = entry.createdAt + 1000000;
      
      expect(entry.isExpired(currentTime)).toBe(false);
    });

    it('should use current time when not provided', () => {
      const entry = new CacheEntry('key1', 'value1', 100);
      
      expect(entry.isExpired()).toBe(false);
    });

    it('should return true exactly at expiration', () => {
      const entry = new CacheEntry('key1', 'value1', 100);
      const currentTime = entry.createdAt + 100;
      
      expect(entry.isExpired(currentTime)).toBe(true);
    });
  });

  describe('recordAccess', () => {
    it('should increment access count', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      
      entry.recordAccess();
      expect(entry.accessCount).toBe(1);
      
      entry.recordAccess();
      expect(entry.accessCount).toBe(2);
    });

    it('should update last accessed time', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      const initialLastAccessed = entry.lastAccessedAt;
      
      setTimeout(() => {
        entry.recordAccess();
        expect(entry.lastAccessedAt).toBeGreaterThan(initialLastAccessed);
      }, 10);
    });

    it('should use provided current time', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      const customTime = Date.now() + 1000;
      
      entry.recordAccess(customTime);
      expect(entry.lastAccessedAt).toBe(customTime);
    });
  });

  describe('getTimeSinceLastAccess', () => {
    it('should return time since last access', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      entry.recordAccess();
      
      setTimeout(() => {
        const timeSince = entry.getTimeSinceLastAccess();
        expect(timeSince).toBeGreaterThan(0);
        expect(timeSince).toBeLessThan(100);
      }, 50);
    });

    it('should return 0 for never accessed entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      
      const timeSince = entry.getTimeSinceLastAccess();
      expect(timeSince).toBe(0);
    });

    it('should use provided current time', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      entry.recordAccess(1000);
      
      const timeSince = entry.getTimeSinceLastAccess(1500);
      expect(timeSince).toBe(500);
    });
  });

  describe('clone', () => {
    it('should create independent copy', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      entry.recordAccess();
      
      const cloned = entry.clone();
      
      expect(cloned.key).toBe(entry.key);
      expect(cloned.value).toBe(entry.value);
      expect(cloned.ttl).toBe(entry.ttl);
      expect(cloned.accessCount).toBe(entry.accessCount);
    });

    it('should not share reference', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      const cloned = entry.clone();
      
      cloned.recordAccess();
      
      expect(entry.accessCount).toBe(0);
      expect(cloned.accessCount).toBe(1);
    });

    it('should preserve createdAt', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      const cloned = entry.clone();
      
      expect(cloned.createdAt).toBe(entry.createdAt);
    });
  });

  describe('edge cases', () => {
    it('should handle very short TTL', () => {
      const entry = new CacheEntry('key1', 'value1', 1);
      
      setTimeout(() => {
        expect(entry.isExpired()).toBe(true);
      }, 10);
    });

    it('should handle very long TTL', () => {
      const entry = new CacheEntry('key1', 'value1', Number.MAX_SAFE_INTEGER);
      
      expect(entry.isExpired()).toBe(false);
    });

    it('should handle negative TTL', () => {
      const entry = new CacheEntry('key1', 'value1', -1);
      
      expect(entry.ttl).toBe(-1);
    });

    it('should handle multiple accesses', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      
      for (let i = 0; i < 1000; i++) {
        entry.recordAccess();
      }
      
      expect(entry.accessCount).toBe(1000);
    });
  });
});
