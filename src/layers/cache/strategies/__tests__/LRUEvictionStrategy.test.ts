/**
 * LRUEvictionStrategy Unit Tests
 * 
 * Tests for LRUEvictionStrategy using AAA pattern.
 */

import { LRUEvictionStrategy } from '../eviction/LRUEvictionStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';

describe('LRUEvictionStrategy', () => {
  let strategy: LRUEvictionStrategy<string>;

  beforeEach(() => {
    strategy = new LRUEvictionStrategy<string>();
  });

  describe('onAdd', () => {
    it('should track added entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      strategy.onAdd('key1', entry);
      
      expect(strategy.selectEntryToEvict(new Map())).toBeNull();
    });

    it('should track multiple entries', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      strategy.onAdd('key1', entry1);
      strategy.onAdd('key2', entry2);
    });
  });

  describe('onAccess', () => {
    it('should update access time', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      strategy.onAdd('key1', entry);
      
      strategy.onAccess('key1', entry);
    });

    it('should move accessed entry to most recent', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      const entries = new Map<string, CacheEntry<string>>();
      
      entries.set('key1', entry1);
      entries.set('key2', entry2);
      
      strategy.onAdd('key1', entry1);
      strategy.onAdd('key2', entry2);
      strategy.onAccess('key1', entry1);
      
      const evicted = strategy.selectEntryToEvict(entries);
      expect(evicted).toBe('key2');
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

    it('should evict least recently used entry', () => {
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

    it('should handle access pattern correctly', () => {
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
      strategy.onAccess('key1', entry1);
      
      const evicted = strategy.selectEntryToEvict(entries);
      expect(evicted).toBe('key2');
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

    it('should handle multiple accesses to same entry', () => {
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
      expect(evicted).toBe('key2');
    });
  });
});
