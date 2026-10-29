/**
 * Segmented Cache Strategy Tests
 */

import { SegmentedCacheStrategy } from '../cache/SegmentedCacheStrategy';
import { CacheError, CacheErrorCode } from '../../errors';

describe('SegmentedCacheStrategy', () => {
  let strategy: SegmentedCacheStrategy<string>;

  beforeEach(async () => {
    strategy = new SegmentedCacheStrategy<string>();
    await strategy.initialize({
      maxSize: 1000,
      defaultTTL: 60000,
      enableMetrics: true,
      segments: [
        { id: 'hot', strategy: 'LRU', maxSize: 100, defaultTTL: 300000, keyPattern: 'hot:' },
        { id: 'warm', strategy: 'LFU', maxSize: 500, defaultTTL: 600000, keyPattern: 'warm:' },
        { id: 'cold', strategy: 'TTL', maxSize: 400, defaultTTL: 60000 },
      ],
      defaultSegment: 'cold',
      enableCrossSegmentOps: true,
    });
  });

  afterEach(async () => {
    await strategy.shutdown();
  });

  describe('segment routing', () => {
    it('should route keys by prefix pattern', async () => {
      await strategy.set('hot:key1', 'value1');
      await strategy.set('warm:key2', 'value2');
      await strategy.set('cold:key3', 'value3');
      await strategy.set('other:key4', 'value4');

      expect((await strategy.get('hot:key1')).hit).toBe(true);
      expect((await strategy.get('warm:key2')).hit).toBe(true);
      expect((await strategy.get('cold:key3')).hit).toBe(true);
      expect((await strategy.get('other:key4')).hit).toBe(true);
    });

    it('should use different strategies per segment', async () => {
      for (let i = 0; i < 150; i++) {
        await strategy.set(`hot:key${i}`, `value${i}`);
      }
      expect((await strategy.get('hot:key0')).hit).toBe(false);
      expect((await strategy.get('hot:key100')).hit).toBe(true);
    });
  });

  describe('basic operations', () => {
    it('should set and get values', async () => {
      await strategy.set('key1', 'value1');
      const result = await strategy.get('key1');
      expect(result.hit).toBe(true);
      expect(result.value).toBe('value1');
    });

    it('should delete values', async () => {
      await strategy.set('key1', 'value1');
      const deleted = await strategy.delete('key1');
      expect(deleted).toBe(true);
      expect((await strategy.get('key1')).hit).toBe(false);
    });

    it('should clear all segments', async () => {
      await strategy.set('hot:key1', 'value1');
      await strategy.set('warm:key2', 'value2');
      await strategy.set('cold:key3', 'value3');
      await strategy.clear();
      expect(await strategy.size()).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should track combined stats', async () => {
      await strategy.set('key1', 'value1');
      await strategy.get('key1');
      await strategy.get('key2');

      const stats = strategy.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should track per-segment stats', async () => {
      await strategy.set('hot:key1', 'value1');
      await strategy.get('hot:key1');
      await strategy.get('hot:key2');

      const hotStats = strategy.getSegmentStats('hot');
      expect(hotStats).not.toBeNull();
      expect(hotStats!.hits).toBe(1);
      expect(hotStats!.misses).toBe(1);
    });

    it('should return all segment stats', async () => {
      await strategy.set('hot:key1', 'value1');
      await strategy.set('warm:key2', 'value2');
      await strategy.get('hot:key1');

      const allStats = strategy.getAllSegmentStats();
      expect(allStats.has('hot')).toBe(true);
      expect(allStats.has('warm')).toBe(true);
      expect(allStats.has('cold')).toBe(true);
    });
  });

  describe('segment management', () => {
    it('should return segment by ID', async () => {
      const hotSegment = strategy.getSegment('hot');
      expect(hotSegment).not.toBeNull();
      expect(hotSegment!.name).toBe('LRU');
    });

    it('should return null for unknown segment', async () => {
      const unknown = strategy.getSegment('unknown');
      expect(unknown).toBeNull();
    });

    it('should list all segment IDs', async () => {
      const ids = strategy.getSegmentIds();
      expect(ids).toContain('hot');
      expect(ids).toContain('warm');
      expect(ids).toContain('cold');
      expect(ids.length).toBe(3);
    });
  });

  describe('cross-segment operations', () => {
    it('should get all keys from all segments', async () => {
      await strategy.set('hot:key1', 'value1');
      await strategy.set('warm:key2', 'value2');
      await strategy.set('cold:key3', 'value3');

      const keys = await strategy.keys();
      expect(keys).toContain('hot:key1');
      expect(keys).toContain('warm:key2');
      expect(keys).toContain('cold:key3');
    });

    it('should get total size across segments', async () => {
      await strategy.set('hot:key1', 'value1');
      await strategy.set('warm:key2', 'value2');
      await strategy.set('cold:key3', 'value3');

      expect(await strategy.size()).toBe(3);
    });
  });

  describe('error handling', () => {
    it('should throw if not initialized', async () => {
      const uninitialized = new SegmentedCacheStrategy<string>();
      await expect(uninitialized.get('key1')).rejects.toThrow(CacheError);
    });

    it('should throw if default segment not in segments', async () => {
      const badStrategy = new SegmentedCacheStrategy<string>();
      await expect(badStrategy.initialize({
        maxSize: 100,
        defaultTTL: 60000,
        segments: [{ id: 'seg1', strategy: 'LRU', maxSize: 50, defaultTTL: 60000 }],
        defaultSegment: 'seg2',
        enableCrossSegmentOps: true,
      })).rejects.toThrow(CacheError);
    });

    it('should throw if no segments configured', async () => {
      const badStrategy = new SegmentedCacheStrategy<string>();
      await expect(badStrategy.initialize({
        maxSize: 100,
        defaultTTL: 60000,
        segments: [],
        defaultSegment: 'default',
        enableCrossSegmentOps: true,
      })).rejects.toThrow(CacheError);
    });
  });
});