/**
 * InMemoryStorage Unit Tests
 * 
 * Tests for InMemoryStorage using AAA pattern.
 */

import { InMemoryStorage } from '../implementations/in-memory/InMemoryStorage';
import { CacheEntry } from '../../domain/entities/CacheEntry';

describe('InMemoryStorage', () => {
  let storage: InMemoryStorage<string>;

  beforeEach(() => {
    storage = new InMemoryStorage<string>();
  });

  describe('get', () => {
    it('should return null for non-existent key', () => {
      const result = storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should return entry for existing key', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      storage.set('key1', entry);
      
      const result = storage.get('key1');
      expect(result).toBe(entry);
    });

    it('should return null for expired entry', () => {
      const entry = new CacheEntry('key1', 'value1', 1);
      storage.set('key1', entry);
      
      setTimeout(() => {
        const result = storage.get('key1');
        expect(result).toBeNull();
      }, 10);
    });
  });

  describe('set', () => {
    it('should store entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      storage.set('key1', entry);
      
      const result = storage.get('key1');
      expect(result).toBe(entry);
    });

    it('should overwrite existing entry', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key1', 'value2', 60000);
      
      storage.set('key1', entry1);
      storage.set('key1', entry2);
      
      const result = storage.get('key1');
      expect(result).toBe(entry2);
    });

    it('should handle multiple entries', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      storage.set('key1', entry1);
      storage.set('key2', entry2);
      
      expect(storage.get('key1')).toBe(entry1);
      expect(storage.get('key2')).toBe(entry2);
    });
  });

  describe('has', () => {
    it('should return false for non-existent key', () => {
      expect(storage.has('nonexistent')).toBe(false);
    });

    it('should return true for existing key', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      storage.set('key1', entry);
      
      expect(storage.has('key1')).toBe(true);
    });

    it('should return false for expired entry', () => {
      const entry = new CacheEntry('key1', 'value1', 1);
      storage.set('key1', entry);
      
      setTimeout(() => {
        expect(storage.has('key1')).toBe(false);
      }, 10);
    });
  });

  describe('delete', () => {
    it('should remove entry', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      storage.set('key1', entry);
      storage.delete('key1');
      
      expect(storage.get('key1')).toBeNull();
    });

    it('should not throw for non-existent key', () => {
      expect(() => {
        storage.delete('nonexistent');
      }).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      storage.set('key1', entry1);
      storage.set('key2', entry2);
      storage.clear();
      
      expect(storage.get('key1')).toBeNull();
      expect(storage.get('key2')).toBeNull();
    });

    it('should handle empty storage', () => {
      expect(() => {
        storage.clear();
      }).not.toThrow();
    });
  });

  describe('size', () => {
    it('should return 0 for empty storage', () => {
      expect(storage.size()).toBe(0);
    });

    it('should return correct size', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      storage.set('key1', entry1);
      expect(storage.size()).toBe(1);
      
      storage.set('key2', entry2);
      expect(storage.size()).toBe(2);
    });

    it('should update size on delete', () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      storage.set('key1', entry);
      storage.delete('key1');
      
      expect(storage.size()).toBe(0);
    });
  });

  describe('keys', () => {
    it('should return empty array for empty storage', () => {
      expect(storage.keys()).toEqual([]);
    });

    it('should return all keys', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      storage.set('key1', entry1);
      storage.set('key2', entry2);
      
      const keys = storage.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });
  });

  describe('values', () => {
    it('should return empty array for empty storage', () => {
      expect(storage.values()).toEqual([]);
    });

    it('should return all values', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      storage.set('key1', entry1);
      storage.set('key2', entry2);
      
      const values = storage.values();
      expect(values).toContain(entry1);
      expect(values).toContain(entry2);
    });
  });

  describe('entries', () => {
    it('should return empty array for empty storage', () => {
      expect(storage.entries()).toEqual([]);
    });

    it('should return all entries', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      storage.set('key1', entry1);
      storage.set('key2', entry2);
      
      const entries = storage.entries();
      expect(entries.length).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 1);
      
      storage.set('key1', entry1);
      storage.set('key2', entry2);
      
      setTimeout(() => {
        storage.cleanup();
        expect(storage.has('key1')).toBe(true);
        expect(storage.has('key2')).toBe(false);
      }, 10);
    });
  });
});
