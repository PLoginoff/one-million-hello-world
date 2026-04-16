/**
 * Cache Manager Unit Tests
 * 
 * Tests for CacheManager implementation using layered architecture.
 * Uses AAA pattern (Arrange, Act, Assert).
 */

import { CacheManager } from '../core/managers/CacheManager';
import { CacheFactory } from '../factories/cache/CacheFactory';
import { InvalidationStrategy } from '../types/cache-types';
import { CacheConfigOptions } from '../configuration/defaults/DefaultConfigs';

describe('CacheManager', () => {
  let cache: CacheManager<string>;

  beforeEach(() => {
    cache = new CacheManager<string>();
  });

  describe('getConfig', () => {
    it('should return default configuration', () => {
      const config = cache.getConfig();

      expect(config).toBeDefined();
      expect(config.maxSize).toBe(1000);
      expect(config.defaultTTL).toBe(60000);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LRU);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      const newConfig: Partial<CacheConfigOptions> = {
        maxSize: 500,
        defaultTTL: 30000,
        invalidationStrategy: InvalidationStrategy.LFU,
        enableMultiLevel: true,
      };

      cache.setConfig(newConfig);
      const config = cache.getConfig();

      expect(config.maxSize).toBe(500);
      expect(config.invalidationStrategy).toBe(InvalidationStrategy.LFU);
    });
  });

  describe('set and get', () => {
    it('should set and get a value', () => {
      cache.set('key1', 'value1');
      const result = cache.get('key1');

      expect(result.hit).toBe(true);
      expect(result.value).toBe('value1');
    });

    it('should return miss for non-existent key', () => {
      const result = cache.get('nonexistent');

      expect(result.hit).toBe(false);
    });

    it('should expire entry after TTL', () => {
      cache.setConfig({ maxSize: 1000, defaultTTL: 100, invalidationStrategy: InvalidationStrategy.LRU, enableMultiLevel: false });
      cache.set('key1', 'value1');

      setTimeout(() => {
        const result = cache.get('key1');
        expect(result.hit).toBe(false);
      }, 150);
    });
  });

  describe('delete', () => {
    it('should delete an entry', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      const result = cache.get('key1');

      expect(result.hit).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('invalidate', () => {
    it('should invalidate entries by pattern', () => {
      cache.set('user:1', 'user1');
      cache.set('user:2', 'user2');
      cache.set('product:1', 'product1');

      cache.invalidate('user:*');

      expect(cache.get('user:1').hit).toBe(false);
      expect(cache.get('user:2').hit).toBe(false);
      expect(cache.get('product:1').hit).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('nonexistent');

      const stats = cache.getStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should track size', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
    });
  });

  describe('eviction', () => {
    it('should evict when max size reached with LRU', () => {
      cache.setConfig({ maxSize: 2, defaultTTL: 60000, invalidationStrategy: InvalidationStrategy.LRU, enableMultiLevel: false });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.get('key1');
      cache.set('key3', 'value3');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(cache.get('key1').hit).toBe(true);
      expect(cache.get('key2').hit).toBe(false);
    });
  });

  describe('getEntries', () => {
    it('should return all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const entries = cache.getEntries();

      expect(entries).toHaveLength(2);
    });
  });
});

describe('CacheFactory', () => {
  describe('create', () => {
    it('should create cache with default config', () => {
      const cache = CacheFactory.create<string>();
      
      expect(cache).toBeDefined();
      expect(cache.getConfig().maxSize).toBe(1000);
    });

    it('should create cache with custom config', () => {
      const cache = CacheFactory.create<string>({ maxSize: 500 });
      
      expect(cache.getConfig().maxSize).toBe(500);
    });
  });

  describe('createHighPerformance', () => {
    it('should create high-performance cache', () => {
      const cache = CacheFactory.createHighPerformance<string>();
      
      expect(cache.getConfig().maxSize).toBe(100);
      expect(cache.getConfig().defaultTTL).toBe(30000);
    });
  });

  describe('createLargeCache', () => {
    it('should create large cache', () => {
      const cache = CacheFactory.createLargeCache<string>();
      
      expect(cache.getConfig().maxSize).toBe(10000);
    });
  });
});
