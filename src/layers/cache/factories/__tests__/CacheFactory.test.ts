/**
 * CacheFactory Unit Tests
 * 
 * Tests for CacheFactory using AAA pattern.
 */

import { CacheFactory } from '../cache/CacheFactory';
import { InvalidationStrategy } from '../../types/cache-types';

describe('CacheFactory', () => {
  describe('create', () => {
    it('should create cache with default options', () => {
      const cache = CacheFactory.create();
      expect(cache).toBeDefined();
    });

    it('should create cache with custom options', () => {
      const cache = CacheFactory.create({
        maxSize: 500,
        defaultTTL: 30000,
        invalidationStrategy: InvalidationStrategy.LFU,
      });
      expect(cache).toBeDefined();
    });

    it('should create cache with LRU strategy', () => {
      const cache = CacheFactory.create({
        invalidationStrategy: InvalidationStrategy.LRU,
      });
      expect(cache).toBeDefined();
    });

    it('should create cache with LFU strategy', () => {
      const cache = CacheFactory.create({
        invalidationStrategy: InvalidationStrategy.LFU,
      });
      expect(cache).toBeDefined();
    });
  });

  describe('createDefault', () => {
    it('should create cache with default configuration', () => {
      const cache = CacheFactory.createDefault();
      expect(cache).toBeDefined();
    });
  });

  describe('createHighPerformance', () => {
    it('should create high-performance cache', () => {
      const cache = CacheFactory.createHighPerformance();
      expect(cache).toBeDefined();
    });
  });

  describe('createLargeCache', () => {
    it('should create large cache', () => {
      const cache = CacheFactory.createLargeCache();
      expect(cache).toBeDefined();
    });
  });

  describe('createMultiLevel', () => {
    it('should create multi-level cache', () => {
      const cache = CacheFactory.createMultiLevel();
      expect(cache).toBeDefined();
    });
  });
});
