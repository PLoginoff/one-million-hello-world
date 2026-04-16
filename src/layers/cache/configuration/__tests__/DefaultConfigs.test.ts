/**
 * DefaultConfigs Unit Tests
 * 
 * Tests for DefaultConfigs using AAA pattern.
 */

import { DefaultConfigs } from '../defaults/DefaultConfigs';
import { InvalidationStrategy } from '../../types/cache-types';

describe('DefaultConfigs', () => {
  describe('DEFAULT', () => {
    it('should have default configuration', () => {
      const config = DefaultConfigs.DEFAULT;
      
      expect(config.maxSize).toBe(1000);
      expect(config.defaultTTL).toBe(60000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
      expect(config.enableMultiLevel).toBe(false);
    });
  });

  describe('HIGH_PERFORMANCE', () => {
    it('should have high-performance configuration', () => {
      const config = DefaultConfigs.HIGH_PERFORMANCE;
      
      expect(config.maxSize).toBe(100);
      expect(config.defaultTTL).toBe(30000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
      expect(config.enableMultiLevel).toBe(false);
    });

    it('should have smaller size than default', () => {
      expect(DefaultConfigs.HIGH_PERFORMANCE.maxSize).toBeLessThan(DefaultConfigs.DEFAULT.maxSize);
    });

    it('should have shorter TTL than default', () => {
      expect(DefaultConfigs.HIGH_PERFORMANCE.defaultTTL).toBeLessThan(DefaultConfigs.DEFAULT.defaultTTL);
    });
  });

  describe('LARGE_CACHE', () => {
    it('should have large cache configuration', () => {
      const config = DefaultConfigs.LARGE_CACHE;
      
      expect(config.maxSize).toBe(10000);
      expect(config.defaultTTL).toBe(300000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LFU);
      expect(config.enableMultiLevel).toBe(false);
    });

    it('should have larger size than default', () => {
      expect(DefaultConfigs.LARGE_CACHE.maxSize).toBeGreaterThan(DefaultConfigs.DEFAULT.maxSize);
    });

    it('should use LFU strategy', () => {
      expect(DefaultConfigs.LARGE_CACHE.invalidationStrategy).toBe(InvalidationStrategy.LFU);
    });
  });

  describe('MULTI_LEVEL', () => {
    it('should have multi-level configuration', () => {
      const config = DefaultConfigs.MULTI_LEVEL;
      
      expect(config.maxSize).toBe(1000);
      expect(config.defaultTTL).toBe(60000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
      expect(config.enableMultiLevel).toBe(true);
    });

    it('should have multi-level enabled', () => {
      expect(DefaultConfigs.MULTI_LEVEL.enableMultiLevel).toBe(true);
    });
  });

  describe('TIME_BASED', () => {
    it('should have time-based configuration', () => {
      const config = DefaultConfigs.TIME_BASED;
      
      expect(config.maxSize).toBe(500);
      expect(config.defaultTTL).toBe(120000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.TIME_BASED);
      expect(config.enableMultiLevel).toBe(false);
    });

    it('should use TIME_BASED strategy', () => {
      expect(DefaultConfigs.TIME_BASED.invalidationStrategy).toBe(InvalidationStrategy.TIME_BASED);
    });
  });

  describe('custom', () => {
    it('should create custom configuration', () => {
      const config = DefaultConfigs.custom({
        maxSize: 2000,
        defaultTTL: 90000,
      });
      
      expect(config.maxSize).toBe(2000);
      expect(config.defaultTTL).toBe(90000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
      expect(config.enableMultiLevel).toBe(false);
    });

    it('should merge with defaults', () => {
      const config = DefaultConfigs.custom({
        maxSize: 2000,
      });
      
      expect(config.maxSize).toBe(2000);
      expect(config.defaultTTL).toBe(60000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
    });

    it('should accept all properties', () => {
      const config = DefaultConfigs.custom({
        maxSize: 500,
        defaultTTL: 30000,
        invalidationStrategy: InvalidationStrategy.LFU,
        enableMultiLevel: true,
      });
      
      expect(config.maxSize).toBe(500);
      expect(config.defaultTTL).toBe(30000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LFU);
      expect(config.enableMultiLevel).toBe(true);
    });

    it('should handle empty partial', () => {
      const config = DefaultConfigs.custom({});
      
      expect(config).toEqual(DefaultConfigs.DEFAULT);
    });
  });

  describe('immutability', () => {
    it('should not affect original configs', () => {
      const originalMaxSize = DefaultConfigs.DEFAULT.maxSize;
      const custom = DefaultConfigs.custom({ maxSize: 2000 });
      
      expect(DefaultConfigs.DEFAULT.maxSize).toBe(originalMaxSize);
      expect(custom.maxSize).toBe(2000);
    });
  });
});
