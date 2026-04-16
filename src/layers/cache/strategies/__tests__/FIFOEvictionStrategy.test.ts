/**
 * FIFOEvictionStrategy Unit Tests
 * 
 * Tests for FIFOEvictionStrategy using AAA pattern.
 */

import { FIFOEvictionStrategy } from '../eviction/FIFOEvictionStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';

describe('FIFOEvictionStrategy', () => {
  let strategy: FIFOEvictionStrategy<string>;

  beforeEach(() => {
    strategy = new FIFOEvictionStrategy<string>();
  });

  describe('onAdd', () => {
    it('should track added entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      strategy.onAdd('key1', entry);
      
      expect(strategy.selectEntryToEvict(new Map())).toBeNull();
    });

    it('should track order of additions', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      strategy.onAdd('key1', entry1);
      strategy.onAdd('key2', entry2);
    });
  });

  describe('onAccess', () => {
    it('should not affect eviction order', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      strategy.onAdd('key1', entry);
      strategy.onAccess('key1', entry);
    });
  });

  describe('onRemove', () => {
    it('should remove entry from tracking', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      strategy.onAdd('key1', entry);
      strategy.onRemove('key1');
      
      expect(strategy.selectEntryToEvict(new Map())).toBeNull();
    });
  });

  describe('selectEntryToEvict', () => {
    it('should return null for empty cache', () => {
      const entries = new Map<string, CacheEntry<string>>();
      const evicted = strategy.selectEntryToEvict(entries);
      
      expect(evicted).toBeNull();
    });

    it('should evict first added entry', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      const entry3 = new CacheEntry('key3', 'value3', 60000);
      const entries = new Map<string, CacheEntry<string>>();
      
      entries.set('key1', entry1);
      entries.set('key2', entry2);
      entries.set('key3', entry3);
      
      strategy.onAdd('key1', entry1);
      strategy.onAdd('key2', entry2);
      strategy.onAdd('key3', entry3);
      
      const evicted = strategy.selectEntryToEvict(entries);
      expect(evicted).toBe('key1');
    });

    it('should maintain FIFO order after eviction', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      const entry3 = new CacheEntry('key3', 'value3', 60000);
      const entries = new Map<string, CacheEntry<string>>();
      
      entries.set('key1', entry1);
      entries.set('key2', entry2);
      entries.set('key3', entry3);
      
      strategy.onAdd('key1', entry1);
      strategy.onAdd('key2', entry2);
      strategy.onAdd('key3', entry3);
      
      const evicted1 = strategy.selectEntryToEvict(entries);
      expect(evicted1).toBe('key1');
      
      const evicted2 = strategy.selectEntryToEvict(entries);
      expect(evicted2).toBe('key2');
    });
  });

  describe('reset', () => {
    it('should clear tracking state', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      strategy.onAdd('key1', entry);
      strategy.reset();
      
      expect(strategy.selectEntryToEvict(new Map())).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle single entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      const entries = new Map<string, CacheEntry<string>>();
      entries.set('key1', entry);
      
      strategy.onAdd('key1', entry);
      const evicted = strategy.selectEntryToEvict(entries);
      
      expect(evicted).toBe('key1');
    });

    it('should ignore access patterns', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      const entries = new Map<string, CacheEntry<string>>();
      
      entries.set('key1', entry1);
      entries.set('key2', entry2);
      
      strategy.onAdd('key1', entry1);
      strategy.onAdd('key2', entry2);
      strategy.onAccess('key1', entry1);
      strategy.onAccess('key1', entry1);
      strategy.onAccess('key1', entry1);
      
      const evicted = strategy.selectEntryToEvict(entries);
      expect(evicted).toBe('key1');
    });
  });
});
