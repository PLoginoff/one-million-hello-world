/**
 * Cache Factory Tests
 */

import { CacheFactory } from '../CacheFactory';
import { CacheManager } from '../../core/managers/CacheManager';
import type { ICacheStrategy } from '../../strategies/cache/ICacheStrategy';
import { LRUCacheStrategy } from '../../strategies/cache/LRUCacheStrategy';

describe('CacheFactory', () => {
  describe('profile-based creation', () => {
    it('should create development cache', () => {
      const manager = CacheFactory.createDevelopment();
      expect(manager).toBeInstanceOf(CacheManager);
    });

    it('should create staging cache', () => {
      const manager = CacheFactory.createStaging();
      expect(manager).toBeInstanceOf(CacheManager);
    });

    it('should create production cache', () => {
      const manager = CacheFactory.createProduction();
      expect(manager).toBeInstanceOf(CacheManager);
    });

    it('should create test cache', () => {
      const manager = CacheFactory.createTest();
      expect(manager).toBeInstanceOf(CacheManager);
    });

    it('should create high-performance cache', () => {
      const manager = CacheFactory.createHighPerformance();
      expect(manager).toBeInstanceOf(CacheManager);
    });

    it('should create large cache', () => {
      const manager = CacheFactory.createLargeCache();
      expect(manager).toBeInstanceOf(CacheManager);
    });
  });

  describe('custom options', () => {
    it('should accept custom strategy', () => {
      const customStrategy = new LRUCacheStrategy();
      const manager = CacheFactory.create({
        profile: 'development',
        strategy: customStrategy,
      });
      expect(manager).toBeInstanceOf(CacheManager);
    });

    it('should accept strategy by name', () => {
      const manager = CacheFactory.create({
        profile: 'development',
        strategy: 'lru',
      });
      expect(manager).toBeInstanceOf(CacheManager);
    });

    it('should accept config overrides', () => {
      const manager = CacheFactory.create({
        profile: 'development',
        config: { maxSize: 5000, defaultTTL: 120000 },
      });
      expect(manager).toBeInstanceOf(CacheManager);
    });
  });

  describe('multi-level cache', () => {
    it('should create multi-level cache with Redis config', () => {
      const manager = CacheFactory.createMultiLevel({
        redisConfig: { host: 'localhost', port: 6379 },
      });
      expect(manager).toBeInstanceOf(CacheManager);
    });
  });

  describe('segmented cache', () => {
    it('should create segmented cache', () => {
      const manager = CacheFactory.createSegmented([
        { id: 'hot', strategy: 'LRU', maxSize: 100, defaultTTL: 300000, keyPattern: 'hot:' },
        { id: 'cold', strategy: 'TTL', maxSize: 900, defaultTTL: 60000 },
      ], { profile: 'production' });
      expect(manager).toBeInstanceOf(CacheManager);
    });
  });
});