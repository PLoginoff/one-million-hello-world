/**
 * Cache Layer Tests
 * 
 * Comprehensive test suite for Cache implementation.
 * Tests all caching operations, eviction policies, TTL, and statistics.
 */

import { Cache } from '../implementations/Cache';
import { ICache } from '../interfaces/ICache';
import {
  EvictionPolicy,
  InvalidationStrategy,
  CacheKeyPattern,
} from '../types/cache-types';

describe('Cache', () => {
  let cache: Cache<unknown>;

  beforeEach(() => {
    // Initialize Cache before each test
    cache = new Cache<unknown>();
  });

  describe('Initialization', () => {
    /**
     * Test that Cache initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = cache.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.defaultTTL).toBe(60000);
      expect(config.maxSize).toBe(1000);
      expect(config.evictionPolicy).toBe(EvictionPolicy.LRU);
    });

    /**
     * Test that Cache initializes empty
     */
    it('should initialize empty', () => {
      const size = cache.getEntryCount();
      expect(size).toBe(0);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.evictions).toBe(0);
    });
  });

  describe('Basic Operations', () => {
    /**
     * Test setting a value successfully
     */
    it('should set a value successfully', async () => {
      const result = await cache.set('key1', 'value1');

      expect(result.success).toBe(true);
      expect(result.hit).toBe(false);
    });

    /**
     * Test getting a cached value successfully
     */
    it('should get a cached value successfully', async () => {
      await cache.set('key1', 'value1');
      const result = await cache.get('key1');

      expect(result.success).toBe(true);
      expect(result.data).toBe('value1');
      expect(result.hit).toBe(true);
    });

    /**
     * Test getting a non-existent key returns miss
     */
    it('should return miss for non-existent key', async () => {
      const result = await cache.get('non-existent');

      expect(result.success).toBe(false);
      expect(result.hit).toBe(false);
    });

    /**
     * Test deleting a key successfully
     */
    it('should delete a key successfully', async () => {
      await cache.set('key1', 'value1');
      const result = await cache.delete('key1');

      expect(result.success).toBe(true);

      const getAfterDelete = await cache.get('key1');
      expect(getAfterDelete.hit).toBe(false);
    });

    /**
     * Test checking if key exists
     */
    it('should check if key exists', async () => {
      await cache.set('key1', 'value1');

      const exists = await cache.has('key1');
      expect(exists.success).toBe(true);
      expect(exists.data).toBe(true);

      const notExists = await cache.has('non-existent');
      expect(notExists.success).toBe(true);
      expect(notExists.data).toBe(false);
    });

    /**
     * Test clearing all keys
     */
    it('should clear all keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      const result = await cache.clear();
      expect(result.success).toBe(true);

      const size = cache.getEntryCount();
      expect(size).toBe(0);
    });
  });

  describe('TTL Expiration', () => {
    /**
     * Test that expired entries are not returned
     */
    it('should not return expired entries', async () => {
      await cache.set('key1', 'value1', 100);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = await cache.get('key1');
      expect(result.hit).toBe(false);
    });

    /**
     * Test that custom TTL is respected
     */
    it('should respect custom TTL', async () => {
      await cache.set('key1', 'value1', 5000);
      await cache.set('key2', 'value2', 100);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const result1 = await cache.get('key1');
      const result2 = await cache.get('key2');

      expect(result1.hit).toBe(true);
      expect(result2.hit).toBe(false);
    });
  });

  describe('Eviction Policies', () => {
    /**
     * Test LRU eviction removes least recently used
     */
    it('should evict least recently used with LRU policy', async () => {
      const config = { maxSize: 2 };
      cache.setConfig(config);
      cache.setEvictionPolicy(EvictionPolicy.LRU);

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      // Access key1 to make it more recently used
      await cache.get('key1');

      // Add third key to trigger eviction
      await cache.set('key3', 'value3');

      const result1 = await cache.get('key1');
      const result2 = await cache.get('key2');
      const result3 = await cache.get('key3');

      expect(result1.hit).toBe(true);
      expect(result2.hit).toBe(false);
      expect(result3.hit).toBe(true);
    });

    /**
     * Test LFU eviction removes least frequently used
     */
    it('should evict least frequently used with LFU policy', async () => {
      const config = { maxSize: 2 };
      cache.setConfig(config);
      cache.setEvictionPolicy(EvictionPolicy.LFU);

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      // Access key1 multiple times
      await cache.get('key1');
      await cache.get('key1');

      // Add third key to trigger eviction
      await cache.set('key3', 'value3');

      const result2 = await cache.get('key2');
      expect(result2.hit).toBe(false);
    });

    /**
     * Test FIFO eviction removes oldest
     */
    it('should evict oldest with FIFO policy', async () => {
      const config = { maxSize: 2 };
      cache.setConfig(config);
      cache.setEvictionPolicy(EvictionPolicy.FIFO);

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const result1 = await cache.get('key1');
      expect(result1.hit).toBe(false);
    });
  });

  describe('Batch Operations', () => {
    /**
     * Test getting multiple keys
     */
    it('should get multiple keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const keys = ['key1', 'key2', 'key3'];
      const result = await cache.getMany(keys);

      expect(result.success).toBe(true);
      expect(result.data?.size).toBe(3);
      expect(result.hit).toBe(true);
    });

    /**
     * Test setting multiple keys
     */
    it('should set multiple keys', async () => {
      const entries = new Map<string, unknown>([
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3'],
      ]);

      const result = await cache.setMany(entries);
      expect(result.success).toBe(true);

      const size = cache.getEntryCount();
      expect(size).toBe(3);
    });

    /**
     * Test deleting multiple keys
     */
    it('should delete multiple keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const keys = ['key1', 'key2'];
      const result = await cache.deleteMany(keys);

      expect(result.success).toBe(true);

      const size = cache.getEntryCount();
      expect(size).toBe(1);
    });
  });

  describe('Invalidation', () => {
    /**
     * Test pattern-based invalidation
     */
    it('should invalidate keys matching pattern', async () => {
      await cache.set('user:1', 'value1');
      await cache.set('user:2', 'value2');
      await cache.set('product:1', 'value3');

      const pattern: CacheKeyPattern = {
        pattern: 'user:*',
        parameters: [],
      };

      const result = await cache.invalidate(pattern, InvalidationStrategy.IMMEDIATE);
      expect(result.success).toBe(true);
      expect(result.data).toBe(2);

      const userResult = await cache.get('user:1');
      const productResult = await cache.get('product:1');

      expect(userResult.hit).toBe(false);
      expect(productResult.hit).toBe(true);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track hits and misses correctly
     */
    it('should track hits and misses correctly', async () => {
      await cache.set('key1', 'value1');

      await cache.get('key1');
      await cache.get('key1');
      await cache.get('non-existent');

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(2 / 3);
    });

    /**
     * Test stats track evictions correctly
     */
    it('should track evictions correctly', async () => {
      const config = { maxSize: 2 };
      cache.setConfig(config);

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const stats = cache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');

      cache.resetStats();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enabled: false,
        defaultTTL: 30000,
        maxSize: 500,
      };

      cache.setConfig(newConfig);
      const config = cache.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.defaultTTL).toBe(30000);
      expect(config.maxSize).toBe(500);
    });

    /**
     * Test setting eviction policy
     */
    it('should set eviction policy', () => {
      cache.setEvictionPolicy(EvictionPolicy.LFU);
      expect(cache.getEvictionPolicy()).toBe(EvictionPolicy.LFU);
    });
  });

  describe('Cache Warming', () => {
    /**
     * Test cache warming with data
     */
    it('should warm cache with data', async () => {
      const data = new Map<string, unknown>([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ]);

      const result = await cache.warmUp(data);
      expect(result.success).toBe(true);

      const size = cache.getEntryCount();
      expect(size).toBe(2);
    });
  });

  describe('Size Management', () => {
    /**
     * Test get size returns correct size
     */
    it('should return correct size', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      const size = cache.getSize();
      expect(size).toBeGreaterThan(0);
    });

    /**
     * Test get entry count returns correct count
     */
    it('should return correct entry count', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      const count = cache.getEntryCount();
      expect(count).toBe(2);
    });
  });

  describe('Disabled Cache', () => {
    /**
     * Test disabled cache returns no data
     */
    it('should return no data when disabled', async () => {
      cache.setConfig({ enabled: false });

      const setResult = await cache.set('key1', 'value1');
      expect(setResult.success).toBe(false);

      const getResult = await cache.get('key1');
      expect(getResult.success).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test setting value with empty key
     */
    it('should handle empty key', async () => {
      const result = await cache.set('', 'value1');

      expect(result.success).toBe(true);
    });

    /**
     * Test getting value with empty key
     */
    it('should handle get with empty key', async () => {
      await cache.set('', 'value1');
      const result = await cache.get('');

      expect(result.success).toBe(true);
      expect(result.data).toBe('value1');
    });

    /**
     * Test setting null value
     */
    it('should handle null value', async () => {
      const result = await cache.set('key1', null as any);

      expect(result.success).toBe(true);
    });

    /**
     * Test setting undefined value
     */
    it('should handle undefined value', async () => {
      const result = await cache.set('key1', undefined as any);

      expect(result.success).toBe(true);
    });

    /**
     * Test very long key
     */
    it('should handle very long key', async () => {
      const longKey = 'a'.repeat(10000);
      const result = await cache.set(longKey, 'value1');

      expect(result.success).toBe(true);
    });

    /**
     * Test very long value
     */
    it('should handle very long value', async () => {
      const longValue = 'a'.repeat(100000);
      const result = await cache.set('key1', longValue);

      expect(result.success).toBe(true);

      const get = await cache.get('key1');
      expect(get.data).toBe(longValue);
    });

    /**
     * Test special characters in key
     */
    it('should handle special characters in key', async () => {
      const result = await cache.set('key-!@#$%^&*()', 'value1');

      expect(result.success).toBe(true);
    });

    /**
     * Test unicode characters in key
     */
    it('should handle unicode characters in key', async () => {
      const result = await cache.set('ключ-测试-🔑', 'value1');

      expect(result.success).toBe(true);
    });

    /**
     * Test zero TTL
     */
    it('should handle zero TTL', async () => {
      const result = await cache.set('key1', 'value1', 0);

      expect(result.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 10));
      const get = await cache.get('key1');
      expect(get.hit).toBe(false);
    });

    /**
     * Test negative TTL
     */
    it('should handle negative TTL', async () => {
      const result = await cache.set('key1', 'value1', -1000);

      expect(result.success).toBe(true);
    });

    /**
     * Test very large TTL
     */
    it('should handle very large TTL', async () => {
      const result = await cache.set('key1', 'value1', Number.MAX_SAFE_INTEGER);

      expect(result.success).toBe(true);

      const get = await cache.get('key1');
      expect(get.hit).toBe(true);
    });

    /**
     * Test delete non-existent key
     */
    it('should handle delete of non-existent key', async () => {
      const result = await cache.delete('non-existent');

      expect(result.success).toBe(true);
    });

    /**
     * Test has with non-existent key
     */
    it('should handle has with non-existent key', async () => {
      const result = await cache.has('non-existent');

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    /**
     * Test clear empty cache
     */
    it('should handle clear of empty cache', async () => {
      const result = await cache.clear();

      expect(result.success).toBe(true);
    });

    /**
     * Test getMany with empty array
     */
    it('should handle getMany with empty array', async () => {
      const result = await cache.getMany([]);

      expect(result.success).toBe(true);
      expect(result.data?.size).toBe(0);
    });

    /**
     * Test setMany with empty map
     */
    it('should handle setMany with empty map', async () => {
      const result = await cache.setMany(new Map());

      expect(result.success).toBe(true);
    });

    /**
     * Test deleteMany with empty array
     */
    it('should handle deleteMany with empty array', async () => {
      const result = await cache.deleteMany([]);

      expect(result.success).toBe(true);
    });

    /**
     * Test invalidate with no matches
     */
    it('should handle invalidate with no matches', async () => {
      await cache.set('key1', 'value1');

      const pattern: CacheKeyPattern = { pattern: 'non-existent:*', parameters: [] };
      const result = await cache.invalidate(pattern, InvalidationStrategy.IMMEDIATE);

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });
  });

  describe('Concurrent Operations', () => {
    /**
     * Test concurrent gets
     */
    it('should handle concurrent gets', async () => {
      await cache.set('key1', 'value1');

      const promises = Array.from({ length: 10 }, () => cache.get('key1'));
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.hit).toBe(true);
      });
    });

    /**
     * Test concurrent sets
     */
    it('should handle concurrent sets', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        cache.set(`key-${i}`, `value-${i}`)
      );
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      const count = cache.getEntryCount();
      expect(count).toBe(10);
    });

    /**
     * Test concurrent deletes
     */
    it('should handle concurrent deletes', async () => {
      for (let i = 0; i < 10; i++) {
        await cache.set(`key-${i}`, `value-${i}`);
      }

      const promises = Array.from({ length: 10 }, (_, i) => cache.delete(`key-${i}`));
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      const count = cache.getEntryCount();
      expect(count).toBe(0);
    });

    /**
     * Test mixed concurrent operations
     */
    it('should handle mixed concurrent operations', async () => {
      const promises = [
        cache.set('key1', 'value1'),
        cache.set('key2', 'value2'),
        cache.get('key1'),
        cache.has('key2'),
        cache.delete('key1'),
      ];

      const results = await Promise.all(promises);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
      expect(results[3].success).toBe(true);
      expect(results[4].success).toBe(true);
    });

    /**
     * Test concurrent getMany operations
     */
    it('should handle concurrent getMany operations', async () => {
      for (let i = 0; i < 10; i++) {
        await cache.set(`key-${i}`, `value-${i}`);
      }

      const keys = Array.from({ length: 10 }, (_, i) => `key-${i}`);
      const promises = Array.from({ length: 5 }, () => cache.getMany(keys));
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data?.size).toBe(10);
      });
    });
  });

  describe('Performance Tests', () => {
    /**
     * Test set performance with many entries
     */
    it('should handle setting many entries efficiently', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await cache.set(`key-${i}`, `value-${i}`);
      }

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000);
      expect(cache.getEntryCount()).toBe(1000);
    });

    /**
     * Test get performance with many entries
     */
    it('should handle getting many entries efficiently', async () => {
      for (let i = 0; i < 1000; i++) {
        await cache.set(`key-${i}`, `value-${i}`);
      }

      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await cache.get(`key-${i}`);
      }

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000);
    });

    /**
     * Test setMany performance with many entries
     */
    it('should handle setMany with many entries efficiently', async () => {
      const entries = new Map<string, unknown>();
      for (let i = 0; i < 1000; i++) {
        entries.set(`key-${i}`, `value-${i}`);
      }

      const startTime = Date.now();
      const result = await cache.setMany(entries);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000);
      expect(cache.getEntryCount()).toBe(1000);
    });

    /**
     * Test getMany performance with many entries
     */
    it('should handle getMany with many entries efficiently', async () => {
      for (let i = 0; i < 1000; i++) {
        await cache.set(`key-${i}`, `value-${i}`);
      }

      const keys = Array.from({ length: 1000 }, (_, i) => `key-${i}`);

      const startTime = Date.now();
      const result = await cache.getMany(keys);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.data?.size).toBe(1000);
      expect(endTime - startTime).toBeLessThan(5000);
    });

    /**
     * Test invalidate performance with many entries
     */
    it('should handle invalidate with many entries efficiently', async () => {
      for (let i = 0; i < 1000; i++) {
        await cache.set(`prefix-${i}`, `value-${i}`);
      }

      const pattern: CacheKeyPattern = { pattern: 'prefix-*', parameters: [] };

      const startTime = Date.now();
      const result = await cache.invalidate(pattern, InvalidationStrategy.IMMEDIATE);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.data).toBe(1000);
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('Error Handling', () => {
    /**
     * Test cache handles invalid pattern gracefully
     */
    it('should handle invalid pattern gracefully', async () => {
      const pattern: CacheKeyPattern = { pattern: '[invalid(', parameters: [] };

      const result = await cache.invalidate(pattern, InvalidationStrategy.IMMEDIATE);

      expect(result.success).toBe(false);
    });

    /**
     * Test cache operations when disabled
     */
    it('should handle all operations when disabled', async () => {
      cache.setConfig({ enabled: false });

      const setResult = await cache.set('key1', 'value1');
      const getResult = await cache.get('key1');
      const deleteResult = await cache.delete('key1');
      const hasResult = await cache.has('key1');
      const clearResult = await cache.clear();

      expect(setResult.success).toBe(false);
      expect(getResult.success).toBe(false);
      expect(deleteResult.success).toBe(false);
      expect(hasResult.success).toBe(false);
      expect(clearResult.success).toBe(true);
    });

    /**
     * Test cache with stats disabled
     */
    it('should handle operations with stats disabled', async () => {
      cache.setConfig({ enableStats: false });

      await cache.set('key1', 'value1');
      await cache.get('key1');
      await cache.get('non-existent');

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Configuration Edge Cases', () => {
    /**
     * Test configuration with zero max size
     */
    it('should handle zero max size', () => {
      cache.setConfig({ maxSize: 0 });
      const config = cache.getConfig();

      expect(config.maxSize).toBe(0);
    });

    /**
     * Test configuration with negative max size
     */
    it('should handle negative max size', () => {
      cache.setConfig({ maxSize: -100 });
      const config = cache.getConfig();

      expect(config.maxSize).toBe(-100);
    });

    /**
     * Test configuration with very large max size
     */
    it('should handle very large max size', () => {
      cache.setConfig({ maxSize: Number.MAX_SAFE_INTEGER });
      const config = cache.getConfig();

      expect(config.maxSize).toBe(Number.MAX_SAFE_INTEGER);
    });

    /**
     * Test configuration with zero default TTL
     */
    it('should handle zero default TTL', () => {
      cache.setConfig({ defaultTTL: 0 });
      const config = cache.getConfig();

      expect(config.defaultTTL).toBe(0);
    });

    /**
     * Test configuration with negative default TTL
     */
    it('should handle negative default TTL', () => {
      cache.setConfig({ defaultTTL: -1000 });
      const config = cache.getConfig();

      expect(config.defaultTTL).toBe(-1000);
    });

    /**
     * Test configuration with very large default TTL
     */
    it('should handle very large default TTL', () => {
      cache.setConfig({ defaultTTL: Number.MAX_SAFE_INTEGER });
      const config = cache.getConfig();

      expect(config.defaultTTL).toBe(Number.MAX_SAFE_INTEGER);
    });

    /**
     * Test configuration persistence
     */
    it('should persist configuration changes', () => {
      cache.setConfig({
        enabled: false,
        defaultTTL: 30000,
        maxSize: 500,
        evictionPolicy: EvictionPolicy.LFU,
        enableCompression: true,
        enableStats: false,
      });

      const config = cache.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.defaultTTL).toBe(30000);
      expect(config.maxSize).toBe(500);
      expect(config.evictionPolicy).toBe(EvictionPolicy.LFU);
      expect(config.enableCompression).toBe(true);
      expect(config.enableStats).toBe(false);
    });

    /**
     * Test configuration returns copy
     */
    it('should return copy of configuration', () => {
      const config1 = cache.getConfig();
      config1.maxSize = 999;

      const config2 = cache.getConfig();

      expect(config2.maxSize).toBe(1000);
    });
  });

  describe('Statistics Edge Cases', () => {
    /**
     * Test stats with no operations
     */
    it('should return zero stats with no operations', () => {
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.evictions).toBe(0);
    });

    /**
     * Test hit rate calculation with only hits
     */
    it('should calculate hit rate correctly with only hits', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      await cache.get('key1');

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(1);
    });

    /**
     * Test hit rate calculation with only misses
     */
    it('should calculate hit rate correctly with only misses', async () => {
      await cache.get('non-existent1');
      await cache.get('non-existent2');

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    /**
     * Test stats after clear
     */
    it('should reset stats after clear', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      await cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    /**
     * Test stats track current size
     */
    it('should track current size in stats', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.currentSize).toBeGreaterThan(0);
    });

    /**
     * Test stats track total entries
     */
    it('should track total entries in stats', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(2);
    });

    /**
     * Test stats reset
     */
    it('should reset all stats', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1');
      await cache.get('non-existent');

      cache.resetStats();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.evictions).toBe(0);
    });
  });

  describe('TTL Edge Cases', () => {
    /**
     * Test TTL exactly at expiration
     */
    it('should expire exactly at TTL', async () => {
      await cache.set('key1', 'value1', 100);

      await new Promise((resolve) => setTimeout(resolve, 100));
      const result = await cache.get('key1');

      expect(result.hit).toBe(false);
    });

    /**
     * Test TTL with custom and default
     */
    it('should respect custom TTL over default', async () => {
      cache.setConfig({ defaultTTL: 5000 });

      await cache.set('key1', 'value1', 100);
      await cache.set('key2', 'value2');

      await new Promise((resolve) => setTimeout(resolve, 150));

      const result1 = await cache.get('key1');
      const result2 = await cache.get('key2');

      expect(result1.hit).toBe(false);
      expect(result2.hit).toBe(true);
    });

    /**
     * Test TTL refresh on set
     */
    it('should refresh TTL on set', async () => {
      await cache.set('key1', 'value1', 100);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await cache.set('key1', 'value1-updated', 100);
      await new Promise((resolve) => setTimeout(resolve, 60));

      const result = await cache.get('key1');
      expect(result.hit).toBe(true);
    });

    /**
     * Test multiple expirations
     */
    it('should handle multiple expirations', async () => {
      await cache.set('key1', 'value1', 100);
      await cache.set('key2', 'value2', 200);
      await cache.set('key3', 'value3', 300);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const result1 = await cache.get('key1');
      const result2 = await cache.get('key2');
      const result3 = await cache.get('key3');

      expect(result1.hit).toBe(false);
      expect(result2.hit).toBe(false);
      expect(result3.hit).toBe(true);
    });
  });

  describe('Eviction Policy Edge Cases', () => {
    /**
     * Test TTL eviction policy
     */
    it('should evict expired entries with TTL policy', async () => {
      cache.setConfig({ maxSize: 100 });
      cache.setEvictionPolicy(EvictionPolicy.TTL);

      await cache.set('key1', 'value1', 100);
      await cache.set('key2', 'value2', 5000);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const stats = cache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });

    /**
     * Test eviction when maxSize is reached
     */
    it('should evict when maxSize is reached', async () => {
      cache.setConfig({ maxSize: 2 });
      cache.setEvictionPolicy(EvictionPolicy.LRU);

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const stats = cache.getStats();
      expect(stats.evictions).toBeGreaterThan(0);
    });

    /**
     * Test no eviction when maxSize is unlimited
     */
    it('should not evict when maxSize is undefined', async () => {
      cache.setConfig({ maxSize: undefined });
      cache.setEvictionPolicy(EvictionPolicy.LRU);

      for (let i = 0; i < 100; i++) {
        await cache.set(`key-${i}`, `value-${i}`);
      }

      const stats = cache.getStats();
      expect(stats.evictions).toBe(0);
    });

    /**
     * Test LRU with equal access times
     */
    it('should handle LRU with equal access times', async () => {
      cache.setConfig({ maxSize: 2 });
      cache.setEvictionPolicy(EvictionPolicy.LRU);

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const result1 = await cache.get('key1');
      expect(result1.hit).toBe(false);
    });

    /**
     * Test LFU with equal access counts
     */
    it('should handle LFU with equal access counts', async () => {
      cache.setConfig({ maxSize: 2 });
      cache.setEvictionPolicy(EvictionPolicy.LFU);

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const result = await cache.get('key1');
      expect(result.hit).toBe(false);
    });
  });

  describe('Batch Operation Edge Cases', () => {
    /**
     * Test getMany with duplicate keys
     */
    it('should handle getMany with duplicate keys', async () => {
      await cache.set('key1', 'value1');

      const result = await cache.getMany(['key1', 'key1', 'key1']);

      expect(result.success).toBe(true);
      expect(result.data?.size).toBe(1);
    });

    /**
     * Test setMany with duplicate keys
     */
    it('should handle setMany with duplicate keys', async () => {
      const entries = new Map<string, unknown>([
        ['key1', 'value1'],
        ['key1', 'value1-updated'],
        ['key2', 'value2'],
      ]);

      const result = await cache.setMany(entries);
      expect(result.success).toBe(true);

      const get = await cache.get('key1');
      expect(get.data).toBe('value1-updated');
    });

    /**
     * Test deleteMany with duplicate keys
     */
    it('should handle deleteMany with duplicate keys', async () => {
      await cache.set('key1', 'value1');

      const result = await cache.deleteMany(['key1', 'key1', 'key1']);
      expect(result.success).toBe(true);

      const count = cache.getEntryCount();
      expect(count).toBe(0);
    });

    /**
     * Test setMany with custom TTL
     */
    it('should handle setMany with custom TTL', async () => {
      const entries = new Map<string, unknown>([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ]);

      await cache.setMany(entries, 100);
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result1 = await cache.get('key1');
      const result2 = await cache.get('key2');

      expect(result1.hit).toBe(false);
      expect(result2.hit).toBe(false);
    });
  });

  describe('Invalidation Edge Cases', () => {
    /**
     * Test invalidate with empty pattern
     */
    it('should handle invalidate with empty pattern', async () => {
      await cache.set('key1', 'value1');

      const pattern: CacheKeyPattern = { pattern: '', parameters: [] };
      const result = await cache.invalidate(pattern, InvalidationStrategy.IMMEDIATE);

      expect(result.success).toBe(true);
    });

    /**
     * Test invalidate with wildcard pattern
     */
    it('should handle invalidate with wildcard pattern', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const pattern: CacheKeyPattern = { pattern: '.*', parameters: [] };
      const result = await cache.invalidate(pattern, InvalidationStrategy.IMMEDIATE);

      expect(result.success).toBe(true);
      expect(result.data).toBe(3);
    });

    /**
     * Test invalidate with case-sensitive pattern
     */
    it('should handle case-sensitive pattern matching', async () => {
      await cache.set('Key1', 'value1');
      await cache.set('key1', 'value2');

      const pattern: CacheKeyPattern = { pattern: 'key.*', parameters: [] };
      const result = await cache.invalidate(pattern, InvalidationStrategy.IMMEDIATE);

      expect(result.data).toBe(1);
    });

    /**
     * Test invalidate with complex pattern
     */
    it('should handle complex pattern matching', async () => {
      await cache.set('user:1:profile', 'value1');
      await cache.set('user:2:profile', 'value2');
      await cache.set('product:1:info', 'value3');

      const pattern: CacheKeyPattern = { pattern: 'user:[0-9]+:profile', parameters: [] };
      const result = await cache.invalidate(pattern, InvalidationStrategy.IMMEDIATE);

      expect(result.data).toBe(2);
    });
  });

  describe('Data Type Handling', () => {
    /**
     * Test caching string values
     */
    it('should handle string values', async () => {
      const result = await cache.set('key1', 'string value');

      expect(result.success).toBe(true);

      const get = await cache.get('key1');
      expect(get.data).toBe('string value');
    });

    /**
     * Test caching number values
     */
    it('should handle number values', async () => {
      const result = await cache.set('key1', 42);

      expect(result.success).toBe(true);

      const get = await cache.get('key1');
      expect(get.data).toBe(42);
    });

    /**
     * Test caching boolean values
     */
    it('should handle boolean values', async () => {
      const result = await cache.set('key1', true);

      expect(result.success).toBe(true);

      const get = await cache.get('key1');
      expect(get.data).toBe(true);
    });

    /**
     * Test caching object values
     */
    it('should handle object values', async () => {
      const obj = { name: 'test', value: 42 };
      const result = await cache.set('key1', obj);

      expect(result.success).toBe(true);

      const get = await cache.get('key1');
      expect(get.data).toEqual(obj);
    });

    /**
     * Test caching array values
     */
    it('should handle array values', async () => {
      const arr = [1, 2, 3, 4, 5];
      const result = await cache.set('key1', arr);

      expect(result.success).toBe(true);

      const get = await cache.get('key1');
      expect(get.data).toEqual(arr);
    });

    /**
     * Test caching nested object values
     */
    it('should handle nested object values', async () => {
      const obj = { nested: { deep: { value: 42 } } };
      const result = await cache.set('key1', obj);

      expect(result.success).toBe(true);

      const get = await cache.get('key1');
      expect(get.data).toEqual(obj);
    });
  });

  describe('Cache Warming Edge Cases', () => {
    /**
     * Test warmUp with empty data
     */
    it('should handle warmUp with empty data', async () => {
      const result = await cache.warmUp(new Map());

      expect(result.success).toBe(true);
    });

    /**
     * Test warmUp with custom TTL
     */
    it('should handle warmUp with custom TTL', async () => {
      const data = new Map<string, unknown>([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ]);

      await cache.warmUp(data, 100);
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result1 = await cache.get('key1');
      const result2 = await cache.get('key2');

      expect(result1.hit).toBe(false);
      expect(result2.hit).toBe(false);
    });

    /**
     * Test warmUp overwrites existing data
     */
    it('should overwrite existing data on warmUp', async () => {
      await cache.set('key1', 'old-value');

      const data = new Map<string, unknown>([
        ['key1', 'new-value'],
      ]);

      await cache.warmUp(data);

      const get = await cache.get('key1');
      expect(get.data).toBe('new-value');
    });

    /**
     * Test warmUp with large dataset
     */
    it('should handle warmUp with large dataset', async () => {
      const data = new Map<string, unknown>();
      for (let i = 0; i < 1000; i++) {
        data.set(`key-${i}`, `value-${i}`);
      }

      const result = await cache.warmUp(data);

      expect(result.success).toBe(true);
      expect(cache.getEntryCount()).toBe(1000);
    });
  });

  describe('Size Management Edge Cases', () => {
    /**
     * Test getSize with empty cache
     */
    it('should return zero size for empty cache', () => {
      const size = cache.getSize();

      expect(size).toBe(0);
    });

    /**
     * Test getSize with single entry
     */
    it('should calculate size correctly for single entry', async () => {
      await cache.set('key1', 'value1');

      const size = cache.getSize();
      expect(size).toBeGreaterThan(0);
    });

    /**
     * Test getSize changes with updates
     */
    it('should update size on updates', async () => {
      await cache.set('key1', 'value1');
      const size1 = cache.getSize();

      await cache.set('key1', 'value1-updated-longer');
      const size2 = cache.getSize();

      expect(size2).toBeGreaterThan(size1);
    });

    /**
     * Test getSize decreases on delete
     */
    it('should decrease size on delete', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      const size1 = cache.getSize();

      await cache.delete('key1');
      const size2 = cache.getSize();

      expect(size2).toBeLessThan(size1);
    });
  });

  describe('TTL Policy Edge Cases', () => {
    /**
     * Test has respects TTL
     */
    it('should respect TTL in has operation', async () => {
      await cache.set('key1', 'value1', 100);

      await new Promise((resolve) => setTimeout(resolve, 150));
      const result = await cache.has('key1');

      expect(result.data).toBe(false);
    });

    /**
     * Test getMany respects TTL
     */
    it('should respect TTL in getMany operation', async () => {
      await cache.set('key1', 'value1', 100);
      await cache.set('key2', 'value2', 5000);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = await cache.getMany(['key1', 'key2']);
      expect(result.data?.size).toBe(1);
    });
  });
});
