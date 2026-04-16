/**
 * CacheStats Unit Tests
 * 
 * Tests for CacheStats value object using AAA pattern.
 */

import { CacheStats } from '../value-objects/CacheStats';

describe('CacheStats', () => {
  describe('constructor', () => {
    it('should create stats with valid data', () => {
      const stats = new CacheStats(100, 10, 5, 50);
      
      expect(stats.hits).toBe(100);
      expect(stats.misses).toBe(10);
      expect(stats.evictions).toBe(5);
      expect(stats.size).toBe(50);
    });

    it('should create stats with zero values', () => {
      const stats = new CacheStats(0, 0, 0, 0);
      
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
      expect(stats.size).toBe(0);
    });

    it('should set createdAt timestamp', () => {
      const before = Date.now();
      const stats = new CacheStats(100, 10, 5, 50);
      const after = Date.now();
      
      expect(stats.createdAt).toBeGreaterThanOrEqual(before);
      expect(stats.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe('getHitRate', () => {
    it('should calculate hit rate correctly', () => {
      const stats = new CacheStats(90, 10, 0, 50);
      
      expect(stats.getHitRate()).toBe(0.9);
    });

    it('should return 0 when no hits', () => {
      const stats = new CacheStats(0, 10, 0, 50);
      
      expect(stats.getHitRate()).toBe(0);
    });

    it('should return 1 when no misses', () => {
      const stats = new CacheStats(10, 0, 0, 50);
      
      expect(stats.getHitRate()).toBe(1);
    });

    it('should return 0 when no requests', () => {
      const stats = new CacheStats(0, 0, 0, 50);
      
      expect(stats.getHitRate()).toBe(0);
    });

    it('should handle large numbers', () => {
      const stats = new CacheStats(1000000, 100, 0, 50);
      
      expect(stats.getHitRate()).toBeCloseTo(0.9999, 3);
    });
  });

  describe('getMissRate', () => {
    it('should calculate miss rate correctly', () => {
      const stats = new CacheStats(90, 10, 0, 50);
      
      expect(stats.getMissRate()).toBe(0.1);
    });

    it('should return 0 when no misses', () => {
      const stats = new CacheStats(10, 0, 0, 50);
      
      expect(stats.getMissRate()).toBe(0);
    });

    it('should return 1 when no hits', () => {
      const stats = new CacheStats(0, 10, 0, 50);
      
      expect(stats.getMissRate()).toBe(1);
    });

    it('should return 0 when no requests', () => {
      const stats = new CacheStats(0, 0, 0, 50);
      
      expect(stats.getMissRate()).toBe(0);
    });
  });

  describe('getTotalRequests', () => {
    it('should calculate total requests', () => {
      const stats = new CacheStats(90, 10, 0, 50);
      
      expect(stats.getTotalRequests()).toBe(100);
    });

    it('should return 0 when no requests', () => {
      const stats = new CacheStats(0, 0, 0, 50);
      
      expect(stats.getTotalRequests()).toBe(0);
    });
  });

  describe('withHit', () => {
    it('should create copy with incremented hits', () => {
      const stats = new CacheStats(10, 5, 0, 50);
      const newStats = stats.withHit();
      
      expect(newStats.hits).toBe(11);
      expect(stats.hits).toBe(10);
    });

    it('should preserve other values', () => {
      const stats = new CacheStats(10, 5, 3, 50);
      const newStats = stats.withHit();
      
      expect(newStats.misses).toBe(5);
      expect(newStats.evictions).toBe(3);
      expect(newStats.size).toBe(50);
    });
  });

  describe('withMiss', () => {
    it('should create copy with incremented misses', () => {
      const stats = new CacheStats(10, 5, 0, 50);
      const newStats = stats.withMiss();
      
      expect(newStats.misses).toBe(6);
      expect(stats.misses).toBe(5);
    });

    it('should preserve other values', () => {
      const stats = new CacheStats(10, 5, 3, 50);
      const newStats = stats.withMiss();
      
      expect(newStats.hits).toBe(10);
      expect(newStats.evictions).toBe(3);
      expect(newStats.size).toBe(50);
    });
  });

  describe('withEviction', () => {
    it('should create copy with incremented evictions', () => {
      const stats = new CacheStats(10, 5, 3, 50);
      const newStats = stats.withEviction();
      
      expect(newStats.evictions).toBe(4);
      expect(stats.evictions).toBe(3);
    });

    it('should preserve other values', () => {
      const stats = new CacheStats(10, 5, 3, 50);
      const newStats = stats.withEviction();
      
      expect(newStats.hits).toBe(10);
      expect(newStats.misses).toBe(5);
      expect(newStats.size).toBe(50);
    });
  });

  describe('withSize', () => {
    it('should create copy with new size', () => {
      const stats = new CacheStats(10, 5, 3, 50);
      const newStats = stats.withSize(100);
      
      expect(newStats.size).toBe(100);
      expect(stats.size).toBe(50);
    });

    it('should handle zero size', () => {
      const stats = new CacheStats(10, 5, 3, 50);
      const newStats = stats.withSize(0);
      
      expect(newStats.size).toBe(0);
    });

    it('should preserve other values', () => {
      const stats = new CacheStats(10, 5, 3, 50);
      const newStats = stats.withSize(100);
      
      expect(newStats.hits).toBe(10);
      expect(newStats.misses).toBe(5);
      expect(newStats.evictions).toBe(3);
    });
  });

  describe('reset', () => {
    it('should reset all statistics to zero', () => {
      const stats = new CacheStats(100, 50, 25, 50);
      const resetStats = stats.reset();
      
      expect(resetStats.hits).toBe(0);
      expect(resetStats.misses).toBe(0);
      expect(resetStats.evictions).toBe(0);
      expect(resetStats.size).toBe(0);
    });

    it('should not affect original stats', () => {
      const stats = new CacheStats(100, 50, 25, 50);
      stats.reset();
      
      expect(stats.hits).toBe(100);
    });

    it('should update createdAt', () => {
      const stats = new CacheStats(100, 50, 25, 50);
      const before = stats.createdAt;
      
      setTimeout(() => {
        const resetStats = stats.reset();
        expect(resetStats.createdAt).toBeGreaterThan(before);
      }, 10);
    });
  });

  describe('toJSON', () => {
    it('should convert to plain object', () => {
      const stats = new CacheStats(100, 50, 25, 50);
      const json = stats.toJSON();
      
      expect(json).toEqual({
        hits: 100,
        misses: 50,
        evictions: 25,
        size: 50,
        createdAt: stats.createdAt,
      });
    });

    it('should not include methods', () => {
      const stats = new CacheStats(100, 50, 25, 50);
      const json = stats.toJSON();
      
      expect(typeof json.getHitRate).toBe('undefined');
      expect(typeof json.reset).toBe('undefined');
    });
  });

  describe('edge cases', () => {
    it('should handle very large numbers', () => {
      const stats = new CacheStats(Number.MAX_SAFE_INTEGER, 0, 0, 0);
      
      expect(stats.hits).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle negative numbers', () => {
      const stats = new CacheStats(-10, -5, -3, -50);
      
      expect(stats.hits).toBe(-10);
      expect(stats.misses).toBe(-5);
    });

    it('should handle decimal numbers', () => {
      const stats = new CacheStats(10.5, 5.5, 3.5, 50.5);
      
      expect(stats.hits).toBe(10.5);
    });
  });
});
