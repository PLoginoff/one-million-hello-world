/**
 * FIFO Cache Strategy Tests
 */

import { FIFOCacheStrategy } from '../cache/FIFOCacheStrategy';
import { CacheError, CacheErrorCode } from '../../errors';

describe('FIFOCacheStrategy', () => {
  let strategy: FIFOCacheStrategy<string>;

  beforeEach(() => {
    strategy = new FIFOCacheStrategy<string>();
    strategy.initialize({
      maxSize: 3,
      defaultTTL: 60000,
      enableMetrics: true,
    });
  });

  afterEach(async () => {
    await strategy.shutdown();
  });

  describe('basic operations', () => {
    it('should set and get values', async () => {
      await strategy.set('key1', 'value1');
      const result = await strategy.get('key1');
      expect(result.hit).toBe(true);
      expect(result.value).toBe('value1');
    });

    it('should return miss for non-existent keys', async () => {
      const result = await strategy.get('nonexistent');
      expect(result.hit).toBe(false);
    });

    it('should delete values', async () => {
      await strategy.set('key1', 'value1');
      const deleted = await strategy.delete('key1');
      expect(deleted).toBe(true);
      const result = await strategy.get('key1');
      expect(result.hit).toBe(false);
    });

    it('should clear all values', async () => {
      await strategy.set('key1', 'value1');
      await strategy.set('key2', 'value2');
      await strategy.clear();
      expect(await strategy.size()).toBe(0);
    });
  });

  describe('FIFO eviction', () => {
    it('should evict oldest entry when capacity reached', async () => {
      await strategy.set('key1', 'value1');
      await strategy.set('key2', 'value2');
      await strategy.set('key3', 'value3');

      const result = await strategy.set('key4', 'value4');
      expect(result.evicted).toBe(true);
      expect(result.evictedKey).toBe('key1');

      expect((await strategy.get('key1')).hit).toBe(false);
      expect((await strategy.get('key2')).hit).toBe(true);
      expect((await strategy.get('key3')).hit).toBe(true);
      expect((await strategy.get('key4')).hit).toBe(true);
    });

    it('should not evict when updating existing key', async () => {
      await strategy.set('key1', 'value1');
      await strategy.set('key2', 'value2');
      await strategy.set('key3', 'value3');

      const result = await strategy.set('key1', 'updated');
      expect(result.evicted).toBe(false);

      expect((await strategy.get('key1')).value).toBe('updated');
      expect((await strategy.get('key2')).hit).toBe(true);
      expect((await strategy.get('key3')).hit).toBe(true);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTTLStrategy = new FIFOCacheStrategy<string>();
      shortTTLStrategy.initialize({
        maxSize: 10,
        defaultTTL: 50,
        enableMetrics: true,
      });

      await shortTTLStrategy.set('key1', 'value1');
      expect((await shortTTLStrategy.get('key1')).hit).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect((await shortTTLStrategy.get('key1')).hit).toBe(false);
      await shortTTLStrategy.shutdown();
    });

    it('should respect custom TTL per entry', async () => {
      const customTTLStrategy = new FIFOCacheStrategy<string>();
      customTTLStrategy.initialize({
        maxSize: 10,
        defaultTTL: 60000,
        enableMetrics: true,
      });

      await customTTLStrategy.set('key1', 'value1', 50);
      await customTTLStrategy.set('key2', 'value2', 60000);

      expect((await customTTLStrategy.get('key1')).hit).toBe(true);
      expect((await customTTLStrategy.get('key2')).hit).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect((await customTTLStrategy.get('key1')).hit).toBe(false);
      expect((await customTTLStrategy.get('key2')).hit).toBe(true);

      await customTTLStrategy.shutdown();
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', async () => {
      await strategy.set('key1', 'value1');
      await strategy.get('key1');
      await strategy.get('key2');

      const stats = strategy.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.getHitRate()).toBe(0.5);
    });

    it('should track evictions', async () => {
      await strategy.set('key1', 'value1');
      await strategy.set('key2', 'value2');
      await strategy.set('key3', 'value3');
      await strategy.set('key4', 'value4');

      const stats = strategy.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('should track size', async () => {
      expect(await strategy.size()).toBe(0);
      await strategy.set('key1', 'value1');
      expect(await strategy.size()).toBe(1);
      await strategy.set('key2', 'value2');
      expect(await strategy.size()).toBe(2);
    });
  });

  describe('maintenance', () => {
    it('should clean up expired entries', async () => {
      const shortTTLStrategy = new FIFOCacheStrategy<string>();
      shortTTLStrategy.initialize({
        maxSize: 10,
        defaultTTL: 600000, // Large TTL so periodic cleanup doesn't fire during test
        enableMetrics: true,
      });

      await shortTTLStrategy.set('key1', 'value1', 50);
      await shortTTLStrategy.set('key2', 'value2', 50);
      await new Promise(resolve => setTimeout(resolve, 120));

      const cleaned = await shortTTLStrategy.maintenance();
      expect(cleaned).toBe(2);
      expect(await shortTTLStrategy.size()).toBe(0);

      await shortTTLStrategy.shutdown();
    });
  });

  describe('error handling', () => {
    it('should throw if not initialized', async () => {
      const uninitialized = new FIFOCacheStrategy<string>();
      await expect(uninitialized.get('key1')).rejects.toThrow(CacheError);
      await expect(uninitialized.set('key1', 'value1')).rejects.toThrow(CacheError);
    });

    it('should throw if initialized twice', async () => {
      await expect(strategy.initialize({
        maxSize: 10,
        defaultTTL: 60000,
      })).rejects.toThrow(CacheError);
    });
  });

  describe('has and keys', () => {
    it('should check existence without updating access', async () => {
      await strategy.set('key1', 'value1');
      expect(await strategy.has('key1')).toBe(true);
      expect(await strategy.has('key2')).toBe(false);
    });

    it('should return all keys', async () => {
      await strategy.set('key1', 'value1');
      await strategy.set('key2', 'value2');
      const keys = await strategy.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys.length).toBe(2);
    });
  });
});