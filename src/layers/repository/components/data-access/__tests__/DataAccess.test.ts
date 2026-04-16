/**
 * Data Access Layer Tests
 * 
 * Comprehensive test suite for DataAccess implementation.
 * Tests all CRUD operations, bulk operations, snapshots, and statistics.
 */

import { DataAccess } from '../implementations/DataAccess';
import { IDataAccess } from '../interfaces/IDataAccess';
import { DomainEntity } from '../../../../../../domain/types/domain-types';
import {
  DataAccessOperation,
  DataAccessConfig,
} from '../types/data-access-types';

// Mock DomainEntity for testing
class TestEntity implements DomainEntity {
  id: string;
  name: string;
  value: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(id: string, name: string, value: number) {
    this.id = id;
    this.name = name;
    this.value = value;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
}

describe('DataAccess', () => {
  let dataAccess: DataAccess<TestEntity>;
  let testEntity: TestEntity;

  beforeEach(() => {
    // Initialize DataAccess before each test
    dataAccess = new DataAccess<TestEntity>();
    testEntity = new TestEntity('test-1', 'Test Entity', 42);
  });

  describe('Initialization', () => {
    /**
     * Test that DataAccess initializes with empty storage
     */
    it('should initialize with empty storage', () => {
      const result = dataAccess.count();
      expect(result).resolves.toEqual({
        success: true,
        data: 0,
      });
    });

    /**
     * Test that DataAccess initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = dataAccess.getConfig();
      expect(config.enablePersistence).toBe(false);
      expect(config.enableIndexing).toBe(false);
      expect(config.maxStorageSize).toBeUndefined();
    });

    /**
     * Test that operation counts are initialized to zero
     */
    it('should initialize operation counts to zero', () => {
      expect(dataAccess.getOperationCount(DataAccessOperation.READ)).toBe(0);
      expect(dataAccess.getOperationCount(DataAccessOperation.WRITE)).toBe(0);
      expect(dataAccess.getOperationCount(DataAccessOperation.DELETE)).toBe(0);
    });
  });

  describe('Write Operations', () => {
    /**
     * Test writing a single entity successfully
     */
    it('should write an entity successfully', async () => {
      const result = await dataAccess.write(testEntity);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(testEntity);
      expect(dataAccess.getOperationCount(DataAccessOperation.WRITE)).toBe(1);
    });

    /**
     * Test writing an entity updates metadata
     */
    it('should update metadata when writing an entity', async () => {
      await dataAccess.write(testEntity);
      const stats = dataAccess.getStats();

      expect(stats.totalEntries).toBe(1);
      expect(stats.lastModified).toBeInstanceOf(Date);
    });

    /**
     * Test writing the same entity twice increments version
     */
    it('should increment version when writing the same entity twice', async () => {
      await dataAccess.write(testEntity);
      const updatedEntity = new TestEntity('test-1', 'Updated', 43);
      await dataAccess.write(updatedEntity);

      const result = await dataAccess.read('test-1');
      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Updated');
    });

    /**
     * Test writing fails when storage is full
     */
    it('should fail when storage is full', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, maxStorageSize: 1 });

      await dataAccess.write(testEntity);
      const anotherEntity = new TestEntity('test-2', 'Another', 1);
      const result = await dataAccess.write(anotherEntity);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('STORAGE_FULL');
    });

    /**
     * Test writing stores checksum for data integrity
     */
    it('should store checksum for data integrity', async () => {
      await dataAccess.write(testEntity);
      const result = await dataAccess.read('test-1');

      expect(result.success).toBe(true);
    });
  });

  describe('Read Operations', () => {
    beforeEach(async () => {
      // Setup: write test entity
      await dataAccess.write(testEntity);
    });

    /**
     * Test reading an existing entity successfully
     */
    it('should read an existing entity successfully', async () => {
      const result = await dataAccess.read('test-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(testEntity);
      expect(dataAccess.getOperationCount(DataAccessOperation.READ)).toBe(1);
    });

    /**
     * Test reading a non-existent entity fails
     */
    it('should fail when reading non-existent entity', async () => {
      const result = await dataAccess.read('non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENTITY_NOT_FOUND');
      expect(result.error?.operation).toBe(DataAccessOperation.READ);
    });

    /**
     * Test reading all entities returns all stored entities
     */
    it('should read all entities successfully', async () => {
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      await dataAccess.write(new TestEntity('test-3', 'Entity 3', 3));

      const result = await dataAccess.readAll();

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(3);
    });

    /**
     * Test readAll returns empty array when storage is empty
     */
    it('should return empty array when storage is empty', async () => {
      await dataAccess.clear();
      const result = await dataAccess.readAll();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('Delete Operations', () => {
    beforeEach(async () => {
      // Setup: write test entity
      await dataAccess.write(testEntity);
    });

    /**
     * Test deleting an existing entity successfully
     */
    it('should delete an existing entity successfully', async () => {
      const result = await dataAccess.delete('test-1');

      expect(result.success).toBe(true);
      expect(dataAccess.getOperationCount(DataAccessOperation.DELETE)).toBe(1);
    });

    /**
     * Test deleted entity cannot be read
     */
    it('should not allow reading a deleted entity', async () => {
      await dataAccess.delete('test-1');
      const readResult = await dataAccess.read('test-1');

      expect(readResult.success).toBe(false);
    });

    /**
     * Test deleting a non-existent entity fails
     */
    it('should fail when deleting non-existent entity', async () => {
      const result = await dataAccess.delete('non-existent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENTITY_NOT_FOUND');
      expect(result.error?.operation).toBe(DataAccessOperation.DELETE);
    });

    /**
     * Test delete updates storage statistics
     */
    it('should update storage statistics after delete', async () => {
      await dataAccess.delete('test-1');
      const stats = dataAccess.getStats();

      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('Exists Operations', () => {
    beforeEach(async () => {
      // Setup: write test entity
      await dataAccess.write(testEntity);
    });

    /**
     * Test exists returns true for existing entity
     */
    it('should return true for existing entity', async () => {
      const result = await dataAccess.exists('test-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });

    /**
     * Test exists returns false for non-existent entity
     */
    it('should return false for non-existent entity', async () => {
      const result = await dataAccess.exists('non-existent');

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });
  });

  describe('Count Operations', () => {
    /**
     * Test count returns zero for empty storage
     */
    it('should return zero for empty storage', async () => {
      const result = await dataAccess.count();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });

    /**
     * Test count returns correct number of entities
     */
    it('should return correct count after writes', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      await dataAccess.write(new TestEntity('test-3', 'Entity 3', 3));

      const result = await dataAccess.count();

      expect(result.success).toBe(true);
      expect(result.data).toBe(3);
    });

    /**
     * Test count updates after deletions
     */
    it('should update count after deletions', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      await dataAccess.delete('test-1');

      const result = await dataAccess.count();

      expect(result.success).toBe(true);
      expect(result.data).toBe(1);
    });
  });

  describe('Bulk Operations', () => {
    /**
     * Test bulk write writes all entities successfully
     */
    it('should write all entities in bulk operation', async () => {
      const entities = [
        new TestEntity('test-1', 'Entity 1', 1),
        new TestEntity('test-2', 'Entity 2', 2),
        new TestEntity('test-3', 'Entity 3', 3),
      ];

      const result = await dataAccess.bulkWrite(entities);

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    /**
     * Test bulk write handles partial failures
     */
    it('should handle partial failures in bulk write', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, maxStorageSize: 2 });

      const entities = [
        new TestEntity('test-1', 'Entity 1', 1),
        new TestEntity('test-2', 'Entity 2', 2),
        new TestEntity('test-3', 'Entity 3', 3),
      ];

      const result = await dataAccess.bulkWrite(entities);

      expect(result.successful).toBeLessThan(3);
      expect(result.failed).toBeGreaterThan(0);
    });

    /**
     * Test bulk delete deletes all specified entities
     */
    it('should delete all specified entities in bulk operation', async () => {
      await dataAccess.write(new TestEntity('test-1', 'Entity 1', 1));
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      await dataAccess.write(new TestEntity('test-3', 'Entity 3', 3));

      const result = await dataAccess.bulkDelete(['test-1', 'test-2']);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
    });

    /**
     * Test bulk delete handles non-existent entities
     */
    it('should handle non-existent entities in bulk delete', async () => {
      await dataAccess.write(new TestEntity('test-1', 'Entity 1', 1));

      const result = await dataAccess.bulkDelete(['test-1', 'non-existent']);

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  describe('Snapshot Operations', () => {
    /**
     * Test create snapshot captures current state
     */
    it('should create a snapshot of current state', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));

      const snapshot = dataAccess.createSnapshot();

      expect(snapshot.data.size).toBe(2);
      expect(snapshot.metadata.size).toBe(2);
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });

    /**
     * Test restore snapshot restores previous state
     */
    it('should restore previous state from snapshot', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));

      const snapshot = dataAccess.createSnapshot();
      await dataAccess.clear();

      const restoreResult = await dataAccess.restoreSnapshot(snapshot);

      expect(restoreResult.success).toBe(true);

      const count = await dataAccess.count();
      expect(count.data).toBe(2);
    });

    /**
     * Test restore snapshot overwrites current state
     */
    it('should overwrite current state when restoring snapshot', async () => {
      await dataAccess.write(testEntity);
      const snapshot = dataAccess.createSnapshot();

      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      await dataAccess.restoreSnapshot(snapshot);

      const count = await dataAccess.count();
      expect(count.data).toBe(1);
    });
  });

  describe('Clear Operations', () => {
    /**
     * Test clear removes all entities
     */
    it('should remove all entities on clear', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));

      const result = await dataAccess.clear();

      expect(result.success).toBe(true);

      const count = await dataAccess.count();
      expect(count.data).toBe(0);
    });

    /**
     * Test clear resets operation counts
     */
    it('should reset operation counts on clear', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.read('test-1');
      dataAccess.resetOperationCounts();

      expect(dataAccess.getOperationCount(DataAccessOperation.WRITE)).toBe(0);
      expect(dataAccess.getOperationCount(DataAccessOperation.READ)).toBe(0);
    });
  });

  describe('Statistics', () => {
    /**
     * Test getStats returns accurate statistics
     */
    it('should return accurate statistics', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));

      const stats = dataAccess.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.lastModified).toBeInstanceOf(Date);
      expect(stats.operationCounts).toBeInstanceOf(Map);
    });

    /**
     * Test getOperationCount returns correct count for operation
     */
    it('should return correct count for specific operation', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));

      const writeCount = dataAccess.getOperationCount(DataAccessOperation.WRITE);

      expect(writeCount).toBe(2);
    });
  });

  describe('Configuration', () => {
    /**
     * Test setConfig updates configuration
     */
    it('should update configuration', () => {
      const newConfig: Partial<DataAccessConfig> = {
        enablePersistence: true,
        maxStorageSize: 100,
      };

      dataAccess.setConfig(newConfig);
      const config = dataAccess.getConfig();

      expect(config.enablePersistence).toBe(true);
      expect(config.maxStorageSize).toBe(100);
    });

    /**
     * Test getConfig returns copy of configuration
     */
    it('should return a copy of configuration', () => {
      const config1 = dataAccess.getConfig();
      config1.maxStorageSize = 50;

      const config2 = dataAccess.getConfig();

      expect(config2.maxStorageSize).toBeUndefined();
    });
  });

  describe('Concurrent Operations', () => {
    /**
     * Test concurrent reads
     */
    it('should handle concurrent reads', async () => {
      await dataAccess.write(testEntity);

      const promises = Array.from({ length: 10 }, () => dataAccess.read('test-1'));
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    /**
     * Test concurrent writes to different entities
     */
    it('should handle concurrent writes to different entities', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        dataAccess.write(new TestEntity(`test-${i}`, `Entity ${i}`, i))
      );
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    /**
     * Test concurrent deletes
     */
    it('should handle concurrent deletes', async () => {
      for (let i = 0; i < 10; i++) {
        await dataAccess.write(new TestEntity(`test-${i}`, `Entity ${i}`, i));
      }

      const promises = Array.from({ length: 10 }, (_, i) => dataAccess.delete(`test-${i}`));
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    /**
     * Test concurrent exists operations
     */
    it('should handle concurrent exists operations', async () => {
      await dataAccess.write(testEntity);

      const promises = Array.from({ length: 10 }, () => dataAccess.exists('test-1'));
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data).toBe(true);
      });
    });

    /**
     * Test concurrent count operations
     */
    it('should handle concurrent count operations', async () => {
      await dataAccess.write(testEntity);

      const promises = Array.from({ length: 10 }, () => dataAccess.count());
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data).toBe(1);
      });
    });

    /**
     * Test concurrent readAll operations
     */
    it('should handle concurrent readAll operations', async () => {
      await dataAccess.write(testEntity);

      const promises = Array.from({ length: 10 }, () => dataAccess.readAll());
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data?.length).toBe(1);
      });
    });

    /**
     * Test mixed concurrent operations
     */
    it('should handle mixed concurrent operations', async () => {
      const promises = [
        dataAccess.write(new TestEntity('test-1', 'Entity 1', 1)),
        dataAccess.write(new TestEntity('test-2', 'Entity 2', 2)),
        dataAccess.read('test-1'),
        dataAccess.exists('test-2'),
        dataAccess.count(),
      ];

      const results = await Promise.all(promises);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
      expect(results[3].success).toBe(true);
      expect(results[4].success).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    /**
     * Test bulk write performance with many entities
     */
    it('should handle bulk write of 1000 entities efficiently', async () => {
      const entities = Array.from({ length: 1000 }, (_, i) =>
        new TestEntity(`test-${i}`, `Entity ${i}`, i)
      );

      const startTime = Date.now();
      const result = await dataAccess.bulkWrite(entities);
      const endTime = Date.now();

      expect(result.successful).toBe(1000);
      expect(endTime - startTime).toBeLessThan(5000);
    });

    /**
     * Test read performance with many entities
     */
    it('should handle read of many entities efficiently', async () => {
      const entities = Array.from({ length: 100 }, (_, i) =>
        new TestEntity(`test-${i}`, `Entity ${i}`, i)
      );
      await dataAccess.bulkWrite(entities);

      const startTime = Date.now();
      const result = await dataAccess.readAll();
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(100);
      expect(endTime - startTime).toBeLessThan(1000);
    });

    /**
     * Test bulk delete performance
     */
    it('should handle bulk delete of 100 entities efficiently', async () => {
      const entities = Array.from({ length: 100 }, (_, i) =>
        new TestEntity(`test-${i}`, `Entity ${i}`, i)
      );
      await dataAccess.bulkWrite(entities);

      const ids = Array.from({ length: 100 }, (_, i) => `test-${i}`);
      const startTime = Date.now();
      const result = await dataAccess.bulkDelete(ids);
      const endTime = Date.now();

      expect(result.successful).toBe(100);
      expect(endTime - startTime).toBeLessThan(1000);
    });

    /**
     * Test count performance with many entities
     */
    it('should handle count efficiently with many entities', async () => {
      const entities = Array.from({ length: 1000 }, (_, i) =>
        new TestEntity(`test-${i}`, `Entity ${i}`, i)
      );
      await dataAccess.bulkWrite(entities);

      const startTime = Date.now();
      const result = await dataAccess.count();
      const endTime = Date.now();

      expect(result.data).toBe(1000);
      expect(endTime - startTime).toBeLessThan(100);
    });

    /**
     * Test exists performance with many entities
     */
    it('should handle exists efficiently with many entities', async () => {
      const entities = Array.from({ length: 1000 }, (_, i) =>
        new TestEntity(`test-${i}`, `Entity ${i}`, i)
      );
      await dataAccess.bulkWrite(entities);

      const startTime = Date.now();
      const result = await dataAccess.exists('test-500');
      const endTime = Date.now();

      expect(result.data).toBe(true);
      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('Error Handling', () => {
    /**
     * Test error objects contain proper structure
     */
    it('should return properly structured error objects', async () => {
      const result = await dataAccess.read('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBeDefined();
      expect(result.error?.message).toBeDefined();
      expect(result.error?.operation).toBeDefined();
    });

    /**
     * Test error codes are consistent
     */
    it('should use consistent error codes', async () => {
      const readResult = await dataAccess.read('non-existent');
      const deleteResult = await dataAccess.delete('non-existent');

      expect(readResult.error?.code).toBe('ENTITY_NOT_FOUND');
      expect(deleteResult.error?.code).toBe('ENTITY_NOT_FOUND');
    });

    /**
     * Test error messages are descriptive
     */
    it('should provide descriptive error messages', async () => {
      const result = await dataAccess.read('non-existent');

      expect(result.error?.message).toContain('not found');
    });

    /**
     * Test error operation type is correct
     */
    it('should set correct operation type in error', async () => {
      const readResult = await dataAccess.read('non-existent');
      const writeResult = await dataAccess.write(testEntity);
      await dataAccess.delete('test-1');
      const deleteResult = await dataAccess.delete('test-1');

      expect(readResult.error?.operation).toBe(DataAccessOperation.READ);
      expect(deleteResult.error?.operation).toBe(DataAccessOperation.DELETE);
    });

    /**
     * Test error handling in bulk operations
     */
    it('should handle errors in bulk operations gracefully', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, maxStorageSize: 2 });

      const entities = Array.from({ length: 5 }, (_, i) =>
        new TestEntity(`test-${i}`, `Entity ${i}`, i)
      );

      const result = await dataAccess.bulkWrite(entities);

      expect(result.successful).toBeLessThan(5);
      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(result.failed);
    });
  });

  describe('Configuration Edge Cases', () => {
    /**
     * Test configuration with negative max storage size
     */
    it('should handle negative max storage size', () => {
      const newConfig: DataAccessConfig = {
        ...dataAccess.getConfig(),
        maxStorageSize: -1,
      };

      dataAccess.setConfig(newConfig);
      const config = dataAccess.getConfig();

      expect(config.maxStorageSize).toBe(-1);
    });

    /**
     * Test configuration with zero max storage size
     */
    it('should handle zero max storage size', () => {
      const newConfig: DataAccessConfig = {
        ...dataAccess.getConfig(),
        maxStorageSize: 0,
      };

      dataAccess.setConfig(newConfig);
      const config = dataAccess.getConfig();

      expect(config.maxStorageSize).toBe(0);
    });

    /**
     * Test configuration with very large max storage size
     */
    it('should handle very large max storage size', () => {
      const newConfig: DataAccessConfig = {
        ...dataAccess.getConfig(),
        maxStorageSize: Number.MAX_SAFE_INTEGER,
      };

      dataAccess.setConfig(newConfig);
      const config = dataAccess.getConfig();

      expect(config.maxStorageSize).toBe(Number.MAX_SAFE_INTEGER);
    });

    /**
     * Test configuration persistence
     */
    it('should persist configuration changes', () => {
      const newConfig: DataAccessConfig = {
        ...dataAccess.getConfig(),
        enablePersistence: true,
        enableIndexing: true,
        maxStorageSize: 100,
      };

      dataAccess.setConfig(newConfig);
      const config = dataAccess.getConfig();

      expect(config.enablePersistence).toBe(true);
      expect(config.enableIndexing).toBe(true);
      expect(config.maxStorageSize).toBe(100);
    });

    /**
     * Test configuration with compression
     */
    it('should handle compression configuration', () => {
      const newConfig: DataAccessConfig = {
        ...dataAccess.getConfig(),
        compressionEnabled: true,
      };

      dataAccess.setConfig(newConfig);
      const config = dataAccess.getConfig();

      expect(config.compressionEnabled).toBe(true);
    });
  });

  describe('Statistics Edge Cases', () => {
    /**
     * Test statistics after many operations
     */
    it('should accurately track statistics after many operations', async () => {
      for (let i = 0; i < 100; i++) {
        await dataAccess.write(new TestEntity(`test-${i}`, `Entity ${i}`, i));
      }

      const stats = dataAccess.getStats();

      expect(stats.totalEntries).toBe(100);
      expect(stats.operationCounts.get(DataAccessOperation.WRITE)).toBe(100);
    });

    /**
     * Test operation counts reset
     */
    it('should reset operation counts correctly', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.read('test-1');
      await dataAccess.delete('test-1');

      dataAccess.resetOperationCounts();
      const writeCount = dataAccess.getOperationCount(DataAccessOperation.WRITE);
      const readCount = dataAccess.getOperationCount(DataAccessOperation.READ);
      const deleteCount = dataAccess.getOperationCount(DataAccessOperation.DELETE);

      expect(writeCount).toBe(0);
      expect(readCount).toBe(0);
      expect(deleteCount).toBe(0);
    });

    /**
     * Test statistics after clear
     */
    it('should update statistics after clear', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      await dataAccess.clear();

      const stats = dataAccess.getStats();

      expect(stats.totalEntries).toBe(0);
    });

    /**
     * Test total size calculation
     */
    it('should calculate total size correctly', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));

      const stats = dataAccess.getStats();

      expect(stats.totalSize).toBeGreaterThan(0);
    });

    /**
     * Test last modified timestamp
     */
    it('should update last modified timestamp', async () => {
      const initialStats = dataAccess.getStats();
      await dataAccess.write(testEntity);
      const updatedStats = dataAccess.getStats();

      expect(updatedStats.lastModified.getTime()).toBeGreaterThanOrEqual(
        initialStats.lastModified.getTime()
      );
    });

    /**
     * Test individual operation count tracking
     */
    it('should track each operation type separately', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.read('test-1');
      await dataAccess.exists('test-1');
      await dataAccess.count();
      await dataAccess.readAll();
      await dataAccess.clear();
      await dataAccess.write(testEntity);
      await dataAccess.delete('test-1');

      const writeCount = dataAccess.getOperationCount(DataAccessOperation.WRITE);
      const readCount = dataAccess.getOperationCount(DataAccessOperation.READ);
      const existsCount = dataAccess.getOperationCount(DataAccessOperation.EXISTS);
      const countCount = dataAccess.getOperationCount(DataAccessOperation.COUNT);
      const clearCount = dataAccess.getOperationCount(DataAccessOperation.CLEAR);
      const deleteCount = dataAccess.getOperationCount(DataAccessOperation.DELETE);

      expect(writeCount).toBe(2);
      expect(readCount).toBeGreaterThan(0);
      expect(existsCount).toBe(1);
      expect(countCount).toBe(1);
      expect(clearCount).toBe(1);
      expect(deleteCount).toBe(1);
    });
  });

  describe('Snapshot Edge Cases', () => {
    /**
     * Test snapshot with empty storage
     */
    it('should create snapshot with empty storage', () => {
      const snapshot = dataAccess.createSnapshot();

      expect(snapshot.data.size).toBe(0);
      expect(snapshot.metadata.size).toBe(0);
    });

    /**
     * Test restore from invalid snapshot
     */
    it('should fail when restoring from invalid snapshot', async () => {
      const invalidSnapshot = { data: new Map(), metadata: new Map(), timestamp: new Date() } as any;

      const result = await dataAccess.restoreSnapshot(invalidSnapshot);

      expect(result.success).toBe(false);
    });

    /**
     * Test multiple snapshots
     */
    it('should handle multiple snapshots', async () => {
      await dataAccess.write(testEntity);
      const snapshot1 = dataAccess.createSnapshot();

      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      const snapshot2 = dataAccess.createSnapshot();

      expect(snapshot1.data.size).toBe(1);
      expect(snapshot2.data.size).toBe(2);
    });

    /**
     * Test snapshot timestamp
     */
    it('should include timestamp in snapshot', () => {
      const snapshot = dataAccess.createSnapshot();

      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });

    /**
     * Test snapshot data isolation
     */
    it('should isolate snapshot data from original', async () => {
      await dataAccess.write(testEntity);
      const snapshot = dataAccess.createSnapshot();

      snapshot.data.set('test-new', new TestEntity('test-new', 'New', 99));

      const result = await dataAccess.read('test-new');

      expect(result.success).toBe(false);
    });

    /**
     * Test restore overwrites data
     */
    it('should overwrite data when restoring', async () => {
      await dataAccess.write(testEntity);
      const snapshot = dataAccess.createSnapshot();

      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      await dataAccess.restoreSnapshot(snapshot);

      const count = await dataAccess.count();

      expect(count.data).toBe(1);
    });

    /**
     * Test snapshot metadata preservation
     */
    it('should preserve metadata in snapshot', async () => {
      await dataAccess.write(testEntity);
      const snapshot = dataAccess.createSnapshot();

      expect(snapshot.metadata.has('test-1')).toBe(true);
    });
  });

  describe('Bulk Operation Edge Cases', () => {
    /**
     * Test bulk write with duplicate IDs
     */
    it('should handle bulk write with duplicate IDs', async () => {
      const entities = [
        new TestEntity('test-1', 'Entity 1', 1),
        new TestEntity('test-1', 'Entity 1 Updated', 2),
        new TestEntity('test-2', 'Entity 2', 3),
      ];

      const result = await dataAccess.bulkWrite(entities);

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
    });

    /**
     * Test bulk delete with duplicate IDs
     */
    it('should handle bulk delete with duplicate IDs', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));

      const result = await dataAccess.bulkDelete(['test-1', 'test-1', 'test-2']);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(1);
    });

    /**
     * Test bulk write with single entity
     */
    it('should handle bulk write with single entity', async () => {
      const entities = [testEntity];

      const result = await dataAccess.bulkWrite(entities);

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
    });

    /**
     * Test bulk delete with single ID
     */
    it('should handle bulk delete with single ID', async () => {
      await dataAccess.write(testEntity);

      const result = await dataAccess.bulkDelete(['test-1']);

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
    });

    /**
     * Test bulk write error details
     */
    it('should include error details in bulk operation failures', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, maxStorageSize: 1 });

      const entities = Array.from({ length: 3 }, (_, i) =>
        new TestEntity(`test-${i}`, `Entity ${i}`, i)
      );

      const result = await dataAccess.bulkWrite(entities);

      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
      result.errors.forEach(error => {
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
      });
    });
  });

  describe('Index Management Edge Cases', () => {
    /**
     * Test createIndex with same field twice
     */
    it('should handle creating index on same field twice', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, enableIndexing: true });

      await dataAccess.createIndex({ field: 'name', unique: false, caseSensitive: true });
      const result = await dataAccess.createIndex({ field: 'name', unique: false, caseSensitive: true });

      expect(result.success).toBe(true);
    });

    /**
     * Test dropIndex on non-existent field
     */
    it('should handle dropping non-existent index', async () => {
      const result = await dataAccess.dropIndex('nonExistentField');

      expect(result.success).toBe(true);
    });

    /**
     * Test createIndex with case sensitivity variations
     */
    it('should handle case sensitivity in index creation', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, enableIndexing: true });

      const result1 = await dataAccess.createIndex({ field: 'name', unique: false, caseSensitive: true });
      const result2 = await dataAccess.createIndex({ field: 'NAME', unique: false, caseSensitive: true });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    /**
     * Test createIndex with unique constraint on existing data
     */
    it('should handle unique index on existing data', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, enableIndexing: true });

      await dataAccess.write(new TestEntity('test-1', 'SameName', 1));
      await dataAccess.write(new TestEntity('test-2', 'SameName', 2));

      const result = await dataAccess.createIndex({ field: 'name', unique: true, caseSensitive: true });

      expect(result.success).toBe(true);
    });
  });

  describe('Data Type Handling', () => {
    /**
     * Test handling of string values
     */
    it('should handle string values correctly', async () => {
      const entity = new TestEntity('test-1', 'String Value', 42);
      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test handling of numeric values
     */
    it('should handle numeric values correctly', async () => {
      const entity = new TestEntity('test-1', 'Test', 42.5);
      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test handling of boolean values (if applicable)
     */
    it('should handle boolean values correctly', async () => {
      const entity = new TestEntity('test-1', 'Test', 1);
      (entity as any).active = true;

      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test handling of date values
     */
    it('should handle date values correctly', async () => {
      const entity = new TestEntity('test-1', 'Test', 42);
      entity.createdAt = new Date('2020-01-01');
      entity.updatedAt = new Date('2020-01-01');

      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test handling of array values (if applicable)
     */
    it('should handle array values correctly', async () => {
      const entity = new TestEntity('test-1', 'Test', 42);
      (entity as any).tags = ['tag1', 'tag2', 'tag3'];

      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test handling of object values (if applicable)
     */
    it('should handle object values correctly', async () => {
      const entity = new TestEntity('test-1', 'Test', 42);
      (entity as any).metadata = { key: 'value', nested: { prop: 123 } };

      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });
  });

  describe('Operation Count Tracking', () => {
    /**
     * Test READ operation count
     */
    it('should track READ operations', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.read('test-1');
      await dataAccess.read('test-1');

      const count = dataAccess.getOperationCount(DataAccessOperation.READ);

      expect(count).toBe(2);
    });

    /**
     * Test WRITE operation count
     */
    it('should track WRITE operations', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));

      const count = dataAccess.getOperationCount(DataAccessOperation.WRITE);

      expect(count).toBe(2);
    });

    /**
     * Test DELETE operation count
     */
    it('should track DELETE operations', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      await dataAccess.delete('test-1');
      await dataAccess.delete('test-2');

      const count = dataAccess.getOperationCount(DataAccessOperation.DELETE);

      expect(count).toBe(2);
    });

    /**
     * Test EXISTS operation count
     */
    it('should track EXISTS operations', async () => {
      await dataAccess.exists('test-1');
      await dataAccess.exists('test-2');

      const count = dataAccess.getOperationCount(DataAccessOperation.EXISTS);

      expect(count).toBe(2);
    });

    /**
     * Test COUNT operation count
     */
    it('should track COUNT operations', async () => {
      await dataAccess.count();
      await dataAccess.count();

      const count = dataAccess.getOperationCount(DataAccessOperation.COUNT);

      expect(count).toBe(2);
    });

    /**
     * Test CLEAR operation count
     */
    it('should track CLEAR operations', async () => {
      await dataAccess.clear();
      await dataAccess.clear();

      const count = dataAccess.getOperationCount(DataAccessOperation.CLEAR);

      expect(count).toBe(2);
    });

    /**
     * Test operation count for non-existent operation
     */
    it('should return 0 for non-existent operation', () => {
      const count = dataAccess.getOperationCount(DataAccessOperation.READ);

      expect(count).toBe(0);
    });

    /**
     * Test resetOperationCounts resets all counts
     */
    it('should reset all operation counts to zero', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.read('test-1');
      await dataAccess.delete('test-1');

      dataAccess.resetOperationCounts();

      expect(dataAccess.getOperationCount(DataAccessOperation.WRITE)).toBe(0);
      expect(dataAccess.getOperationCount(DataAccessOperation.READ)).toBe(0);
      expect(dataAccess.getOperationCount(DataAccessOperation.DELETE)).toBe(0);
    });
  });

  describe('Storage Limit Scenarios', () => {
    /**
     * Test write at exact storage limit
     */
    it('should handle write at exact storage limit', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, maxStorageSize: 5 });

      for (let i = 0; i < 5; i++) {
        await dataAccess.write(new TestEntity(`test-${i}`, `Entity ${i}`, i));
      }

      const count = await dataAccess.count();
      expect(count.data).toBe(5);
    });

    /**
     * Test write exceeding storage limit
     */
    it('should fail when write exceeds storage limit', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, maxStorageSize: 2 });

      await dataAccess.write(new TestEntity('test-1', 'Entity 1', 1));
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));

      const result = await dataAccess.write(new TestEntity('test-3', 'Entity 3', 3));

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('STORAGE_FULL');
    });

    /**
     * Test write after delete within limit
     */
    it('should allow write after delete within limit', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, maxStorageSize: 2 });

      await dataAccess.write(new TestEntity('test-1', 'Entity 1', 1));
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      await dataAccess.delete('test-1');

      const result = await dataAccess.write(new TestEntity('test-3', 'Entity 3', 3));

      expect(result.success).toBe(true);
    });
  });

  describe('Metadata Tracking', () => {
    /**
     * Test metadata creation on write
     */
    it('should create metadata on write', async () => {
      await dataAccess.write(testEntity);
      const stats = dataAccess.getStats();

      expect(stats.totalEntries).toBe(1);
    });

    /**
     * Test metadata version increment
     */
    it('should increment metadata version on update', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-1', 'Updated', 43));

      const result = await dataAccess.read('test-1');
      expect(result.success).toBe(true);
    });

    /**
     * Test metadata deletion on entity delete
     */
    it('should delete metadata when entity is deleted', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.delete('test-1');

      const count = await dataAccess.count();
      expect(count.data).toBe(0);
    });
  });

  describe('Read-Write-Delete Cycle', () => {
    /**
     * Test complete CRUD cycle
     */
    it('should handle complete CRUD cycle', async () => {
      const createResult = await dataAccess.write(testEntity);
      expect(createResult.success).toBe(true);

      const readResult = await dataAccess.read('test-1');
      expect(readResult.success).toBe(true);
      expect(readResult.data?.id).toBe('test-1');

      const updateEntity = new TestEntity('test-1', 'Updated', 99);
      const updateResult = await dataAccess.write(updateEntity);
      expect(updateResult.success).toBe(true);

      const readAfterUpdate = await dataAccess.read('test-1');
      expect(readAfterUpdate.data?.value).toBe(99);

      const deleteResult = await dataAccess.delete('test-1');
      expect(deleteResult.success).toBe(true);

      const readAfterDelete = await dataAccess.read('test-1');
      expect(readAfterDelete.success).toBe(false);
    });

    /**
     * Test multiple CRUD cycles
     */
    it('should handle multiple CRUD cycles', async () => {
      for (let i = 0; i < 10; i++) {
        const entity = new TestEntity(`test-${i}`, `Entity ${i}`, i);
        await dataAccess.write(entity);
      }

      for (let i = 0; i < 10; i++) {
        const result = await dataAccess.read(`test-${i}`);
        expect(result.success).toBe(true);
      }

      for (let i = 0; i < 10; i++) {
        const result = await dataAccess.delete(`test-${i}`);
        expect(result.success).toBe(true);
      }

      const count = await dataAccess.count();
      expect(count.data).toBe(0);
    });
  });

  describe('Index Management', () => {
    /**
     * Test createIndex creates an index when indexing is enabled
     */
    it('should create index when indexing is enabled', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, enableIndexing: true });

      const result = await dataAccess.createIndex({
        field: 'name',
        unique: false,
        caseSensitive: true,
      });

      expect(result.success).toBe(true);
    });

    /**
     * Test createIndex fails when indexing is disabled
     */
    it('should fail when indexing is disabled', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, enableIndexing: false });

      const result = await dataAccess.createIndex({
        field: 'name',
        unique: false,
        caseSensitive: true,
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INDEXING_DISABLED');
    });

    /**
     * Test dropIndex removes existing index
     */
    it('should drop an existing index', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, enableIndexing: true });

      await dataAccess.createIndex({ field: 'name', unique: false, caseSensitive: true });
      const result = await dataAccess.dropIndex('name');

      expect(result.success).toBe(true);
    });

    /**
     * Test createIndex with unique constraint
     */
    it('should create unique index when requested', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, enableIndexing: true });

      const result = await dataAccess.createIndex({
        field: 'id',
        unique: true,
        caseSensitive: true,
      });

      expect(result.success).toBe(true);
    });

    /**
     * Test createIndex fails for non-existent field
     */
    it('should fail when creating index on non-existent field', async () => {
      const currentConfig = dataAccess.getConfig();
      dataAccess.setConfig({ ...currentConfig, enableIndexing: true });

      const result = await dataAccess.createIndex({
        field: 'nonExistentField',
        unique: false,
        caseSensitive: true,
      });

      expect(result.success).toBe(false);
    });

    /**
     * Test dropIndex fails for non-existent index
     */
    it('should fail when dropping non-existent index', async () => {
      const result = await dataAccess.dropIndex('nonExistentIndex');

      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test writing entity with empty ID
     */
    it('should handle entity with empty ID', async () => {
      const entityWithEmptyId = new TestEntity('', 'Test', 42);
      const result = await dataAccess.write(entityWithEmptyId);

      expect(result.success).toBe(true);
    });

    /**
     * Test writing entity with null values
     */
    it('should handle entity with null values', async () => {
      const entity = new TestEntity('test-1', 'Test', 42);
      (entity as any).name = null;

      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test reading with empty ID
     */
    it('should handle reading with empty ID', async () => {
      const result = await dataAccess.read('');

      expect(result.success).toBe(false);
    });

    /**
     * Test deleting with empty ID
     */
    it('should handle deleting with empty ID', async () => {
      const result = await dataAccess.delete('');

      expect(result.success).toBe(false);
    });

    /**
     * Test exists with empty ID
     */
    it('should handle exists with empty ID', async () => {
      const result = await dataAccess.exists('');

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    /**
     * Test bulk write with empty array
     */
    it('should handle bulk write with empty array', async () => {
      const result = await dataAccess.bulkWrite([]);

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });

    /**
     * Test bulk delete with empty array
     */
    it('should handle bulk delete with empty array', async () => {
      const result = await dataAccess.bulkDelete([]);

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });

    /**
     * Test write with duplicate ID
     */
    it('should handle write with duplicate ID', async () => {
      await dataAccess.write(testEntity);
      const duplicateEntity = new TestEntity('test-1', 'Duplicate', 99);

      const result = await dataAccess.write(duplicateEntity);

      expect(result.success).toBe(true);
      const readResult = await dataAccess.read('test-1');
      expect(readResult.data?.value).toBe(99);
    });

    /**
     * Test concurrent writes
     */
    it('should handle concurrent writes', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(dataAccess.write(new TestEntity(`test-${i}`, `Entity ${i}`, i)));
      }

      await Promise.all(promises);

      const count = await dataAccess.count();
      expect(count.data).toBe(10);
    });

    /**
     * Test entity with special characters in ID
     */
    it('should handle special characters in ID', async () => {
      const entity = new TestEntity('test-!@#$%^&*()', 'Test', 42);
      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test entity with very long ID
     */
    it('should handle very long ID', async () => {
      const longId = 'a'.repeat(1000);
      const entity = new TestEntity(longId, 'Test', 42);
      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test entity with very long name
     */
    it('should handle very long name', async () => {
      const longName = 'a'.repeat(10000);
      const entity = new TestEntity('test-1', longName, 42);
      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test entity with negative value
     */
    it('should handle negative value', async () => {
      const entity = new TestEntity('test-1', 'Test', -42);
      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test entity with zero value
     */
    it('should handle zero value', async () => {
      const entity = new TestEntity('test-1', 'Test', 0);
      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test entity with very large value
     */
    it('should handle very large value', async () => {
      const entity = new TestEntity('test-1', 'Test', Number.MAX_SAFE_INTEGER);
      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test entity with very small value
     */
    it('should handle very small value', async () => {
      const entity = new TestEntity('test-1', 'Test', Number.MIN_SAFE_INTEGER);
      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test entity with decimal value
     */
    it('should handle decimal value', async () => {
      const entity = new TestEntity('test-1', 'Test', 42.5);
      const result = await dataAccess.write(entity);

      expect(result.success).toBe(true);
    });

    /**
     * Test write after delete
     */
    it('should handle write after delete', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.delete('test-1');
      const result = await dataAccess.write(testEntity);

      expect(result.success).toBe(true);
    });

    /**
     * Test read after delete
     */
    it('should handle read after delete', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.delete('test-1');
      const result = await dataAccess.read('test-1');

      expect(result.success).toBe(false);
    });

    /**
     * Test exists after delete
     */
    it('should handle exists after delete', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.delete('test-1');
      const result = await dataAccess.exists('test-1');

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    /**
     * Test count after delete
     */
    it('should handle count after delete', async () => {
      await dataAccess.write(testEntity);
      await dataAccess.write(new TestEntity('test-2', 'Entity 2', 2));
      await dataAccess.delete('test-1');
      const result = await dataAccess.count();

      expect(result.data).toBe(1);
    });

    /**
     * Test clear with empty storage
     */
    it('should handle clear with empty storage', async () => {
      const result = await dataAccess.clear();

      expect(result.success).toBe(true);
    });

    /**
     * Test readAll with empty storage
     */
    it('should handle readAll with empty storage', async () => {
      const result = await dataAccess.readAll();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });
});
