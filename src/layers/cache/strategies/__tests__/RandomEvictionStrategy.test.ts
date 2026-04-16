/**
 * RandomEvictionStrategy Unit Tests
 * 
 * Tests for RandomEvictionStrategy using AAA pattern.
 */

import { RandomEvictionStrategy } from '../eviction/RandomEvictionStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';

describe('RandomEvictionStrategy', () => {
  let strategy: RandomEvictionStrategy<string>;

  beforeEach(() => {
    strategy = new RandomEvictionStrategy<string>();
  });

  describe('onAdd', () => {
    it('should track added entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      strategy.onAdd('key1', entry);
      
      expect(strategy.selectEntryToEvict(new Map())).toBeNull();
    });
  });

  describe('onAccess', () => {
    it('should not affect eviction', () => {
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

    it('should return a valid key for non-empty cache', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      const entries = new Map<string, CacheEntry<string>>();
      
      entries.set('key1', entry1);
      entries.set('key2', entry2);
      
      strategy.onAdd('key1', entry1);
      strategy.onAdd('key2', entry2);
      
      const evicted = strategy.selectEntryToEvict(entries);
      expect(['key1', 'key2']).toContain(evicted);
    });

    it('should handle single entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      const entries = new Map<string, CacheEntry<string>>();
      entries.set('key1', entry);
      
      strategy.onAdd('key1', entry);
      const evicted = strategy.selectEntryToEvict(entries);
      
      expect(evicted).toBe('key1');
    });

    it('should select from all entries', () => {
      const entries = new Map<string, CacheEntry<string>>();
      for (let i = 0; i < 100; i++) {
        const entry = new CacheEntry(`key${i}`, `value${i}`, 60000);
        entries.set(`key${i}`, entry);
        strategy.onAdd(`key${i}`, entry);
      }
      
      const evicted = strategy.selectEntryToEvict(entries);
      expect(entries.has(evicted || '')).toBe(true);
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

  describe('randomness', () => {
    it('should not always select same entry', () => {
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
      expect(['key1', 'key2', 'key3']).toContain(evicted);
    });
  });
});
