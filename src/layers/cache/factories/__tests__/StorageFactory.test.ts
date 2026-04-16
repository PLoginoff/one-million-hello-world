/**
 * StorageFactory Unit Tests
 * 
 * Tests for StorageFactory using AAA pattern.
 */

import { StorageFactory, StorageType } from '../storage/StorageFactory';

describe('StorageFactory', () => {
  describe('create', () => {
    it('should create in-memory storage', () => {
      const storage = StorageFactory.create(StorageType.IN_MEMORY);
      expect(storage).toBeDefined();
    });

    it('should create distributed storage', () => {
      const storage = StorageFactory.create(StorageType.DISTRIBUTED);
      expect(storage).toBeDefined();
    });

    it('should throw error for invalid storage type', () => {
      expect(() => {
        StorageFactory.create('INVALID' as any);
      }).toThrow();
    });
  });

  describe('createInMemory', () => {
    it('should create in-memory storage', () => {
      const storage = StorageFactory.createInMemory();
      expect(storage).toBeDefined();
    });

    it('should create storage with custom options', () => {
      const storage = StorageFactory.createInMemory({ maxSize: 1000 });
      expect(storage).toBeDefined();
    });
  });

  describe('createDistributed', () => {
    it('should create distributed storage', () => {
      const storage = StorageFactory.createDistributed();
      expect(storage).toBeDefined();
    });

    it('should create storage with custom options', () => {
      const storage = StorageFactory.createDistributed({ nodes: ['node1', 'node2'] });
      expect(storage).toBeDefined();
    });
  });

  describe('getAvailableStorageTypes', () => {
    it('should return list of available storage types', () => {
      const types = StorageFactory.getAvailableStorageTypes();
      expect(types).toContain(StorageType.IN_MEMORY);
      expect(types).toContain(StorageType.DISTRIBUTED);
    });
  });

  describe('isValidStorageType', () => {
    it('should return true for valid storage types', () => {
      expect(StorageFactory.isValidStorageType(StorageType.IN_MEMORY)).toBe(true);
      expect(StorageFactory.isValidStorageType(StorageType.DISTRIBUTED)).toBe(true);
    });

    it('should return false for invalid storage type', () => {
      expect(StorageFactory.isValidStorageType('INVALID' as any)).toBe(false);
    });
  });
});
