/**
 * CacheMetrics Unit Tests
 * 
 * Tests for CacheMetrics using AAA pattern.
 */

import { CacheMetrics } from '../metrics/CacheMetrics';

describe('CacheMetrics', () => {
  describe('constructor', () => {
    it('should create metrics with valid data', () => {
      const metrics = new CacheMetrics(100, 10, 5, 50);
      
      expect(metrics.hits).toBe(100);
      expect(metrics.misses).toBe(10);
      expect(metrics.evictions).toBe(5);
      expect(metrics.size).toBe(50);
    });

    it('should create metrics with zero values', () => {
      const metrics = new CacheMetrics(0, 0, 0, 0);
      
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.evictions).toBe(0);
      expect(metrics.size).toBe(0);
    });
  });

  describe('getHitRate', () => {
    it('should calculate hit rate correctly', () => {
      const metrics = new CacheMetrics(90, 10, 0, 50);
      
      expect(metrics.getHitRate()).toBe(0.9);
    });

    it('should return 0 when no hits', () => {
      const metrics = new CacheMetrics(0, 10, 0, 50);
      
      expect(metrics.getHitRate()).toBe(0);
    });

    it('should return 1 when no misses', () => {
      const metrics = new CacheMetrics(10, 0, 0, 50);
      
      expect(metrics.getHitRate()).toBe(1);
    });

    it('should return 0 when no requests', () => {
      const metrics = new CacheMetrics(0, 0, 0, 50);
      
      expect(metrics.getHitRate()).toBe(0);
    });
  });

  describe('getMissRate', () => {
    it('should calculate miss rate correctly', () => {
      const metrics = new CacheMetrics(90, 10, 0, 50);
      
      expect(metrics.getMissRate()).toBe(0.1);
    });

    it('should return 0 when no misses', () => {
      const metrics = new CacheMetrics(10, 0, 0, 50);
      
      expect(metrics.getMissRate()).toBe(0);
    });

    it('should return 1 when no hits', () => {
      const metrics = new CacheMetrics(0, 10, 0, 50);
      
      expect(metrics.getMissRate()).toBe(1);
    });
  });

  describe('getTotalRequests', () => {
    it('should calculate total requests', () => {
      const metrics = new CacheMetrics(90, 10, 0, 50);
      
      expect(metrics.getTotalRequests()).toBe(100);
    });

    it('should return 0 when no requests', () => {
      const metrics = new CacheMetrics(0, 0, 0, 50);
      
      expect(metrics.getTotalRequests()).toBe(0);
    });
  });

  describe('getEvictionRate', () => {
    it('should calculate eviction rate', () => {
      const metrics = new CacheMetrics(90, 10, 5, 50);
      
      expect(metrics.getEvictionRate()).toBe(0.05);
    });

    it('should return 0 when no evictions', () => {
      const metrics = new CacheMetrics(90, 10, 0, 50);
      
      expect(metrics.getEvictionRate()).toBe(0);
    });
  });

  describe('getEfficiency', () => {
    it('should calculate efficiency correctly', () => {
      const metrics = new CacheMetrics(90, 10, 5, 50);
      
      const efficiency = metrics.getEfficiency();
      expect(efficiency).toBeGreaterThan(0);
      expect(efficiency).toBeLessThanOrEqual(1);
    });

    it('should return 0 when no requests', () => {
      const metrics = new CacheMetrics(0, 0, 0, 50);
      
      expect(metrics.getEfficiency()).toBe(0);
    });
  });

  describe('toJSON', () => {
    it('should convert to plain object', () => {
      const metrics = new CacheMetrics(100, 50, 25, 50);
      const json = metrics.toJSON();
      
      expect(json).toEqual({
        hits: 100,
        misses: 50,
        evictions: 25,
        size: 50,
        hitRate: 0.6666666666666666,
        missRate: 0.3333333333333333,
        totalRequests: 150,
        evictionRate: 0.16666666666666666,
        efficiency: expect.any(Number),
      });
    });
  });

  describe('edge cases', () => {
    it('should handle large numbers', () => {
      const metrics = new CacheMetrics(1000000, 100000, 10000, 50000);
      
      expect(metrics.getHitRate()).toBeCloseTo(0.909, 2);
    });

    it('should handle negative numbers', () => {
      const metrics = new CacheMetrics(-10, -5, -3, -50);
      
      expect(metrics.hits).toBe(-10);
    });
  });
});
