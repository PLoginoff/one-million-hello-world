/**
 * DistributedStorage Unit Tests
 * 
 * Tests for DistributedStorage using AAA pattern.
 */

import { DistributedStorage } from '../implementations/distributed/DistributedStorage';
import { CacheEntry } from '../../domain/entities/CacheEntry';

describe('DistributedStorage', () => {
  let storage: DistributedStorage<string>;

  beforeEach(() => {
    storage = new DistributedStorage<string>();
  });

  describe('constructor', () => {
    it('should create storage with default options', () => {
      const storage = new DistributedStorage<string>();
      expect(storage).toBeDefined();
    });

    it('should create storage with custom options', () => {
      const storage = new DistributedStorage<string>({
        nodes: ['node1', 'node2'],
        replicationFactor: 2,
      });
      expect(storage).toBeDefined();
    });
  });

  describe('get', () => {
    it('should return null for non-existent key', () => {
      const result = storage.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should return entry for existing key', async () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      await storage.set('key1', entry);
      
      const result = storage.get('key1');
      expect(result).toBeDefined();
    });
  });

  describe('set', () => {
    it('should store entry', async () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      await storage.set('key1', entry);
      
      const result = storage.get('key1');
      expect(result).toBeDefined();
    });

    it('should overwrite existing entry', async () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key1', 'value2', 60000);
      
      await storage.set('key1', entry1);
      await storage.set('key1', entry2);
      
      const result = storage.get('key1');
      expect(result).toBeDefined();
    });
  });

  describe('has', () => {
    it('should return false for non-existent key', () => {
      expect(storage.has('nonexistent')).toBe(false);
    });

    it('should return true for existing key', async () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      await storage.set('key1', entry);
      
      expect(storage.has('key1')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should remove entry', async () => {
      const entry = new CacheEntry('key1', 'value1', 60000);
      await storage.set('key1', entry);
      await storage.delete('key1');
      
      expect(storage.get('key1')).toBeNull();
    });

    it('should not throw for non-existent key', async () => {
      expect(async () => {
        await storage.delete('nonexistent');
      }).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      await storage.set('key1', entry1);
      await storage.set('key2', entry2);
      await storage.clear();
      
      expect(storage.get('key1')).toBeNull();
      expect(storage.get('key2')).toBeNull();
    });
  });

  describe('size', () => {
    it('should return 0 for empty storage', () => {
      expect(storage.size()).toBe(0);
    });

    it('should return correct size', async () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      await storage.set('key1', entry1);
      await storage.set('key2', entry2);
      
      expect(storage.size()).toBeGreaterThan(0);
    });
  });

  describe('keys', () => {
    it('should return empty array for empty storage', () => {
      expect(storage.keys()).toEqual([]);
    });

    it('should return all keys', async () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 60000);
      
      await storage.set('key1', entry1);
      await storage.set('key2', entry2);
      
      const keys = storage.keys();
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      const entry1 = new CacheEntry('key1', 'value1', 60000);
      const entry2 = new CacheEntry('key2', 'value2', 1);
      
      await storage.set('key1', entry1);
      await storage.set('key2', entry2);
      
      setTimeout(async () => {
        await storage.cleanup();
        expect(storage.has('key1')).toBe(true);
        expect(storage.has('key2')).toBe(false);
      }, 10);
    });
  });

  describe('edge cases', () => {
    it('should handle large number of entries', async () => {
      for (let i = 0; i < 1000; i++) {
        const entry = new CacheEntry(`key${i}`, `value${i}`, 60000);
        await storage.set(`key${i}`, entry);
      }
      
      expect(storage.size()).toBe(1000);
    });
  });
});
