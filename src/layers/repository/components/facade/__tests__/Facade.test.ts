/**
 * Repository Facade Layer Tests
 * 
 * Comprehensive test suite for RepositoryFacade implementation.
 * Tests facade operations, layer coordination, configuration, and statistics.
 */

import { RepositoryFacade } from '../implementations/RepositoryFacade';
import { IRepositoryFacade } from '../interfaces/IRepositoryFacade';
import {
  FacadeQueryOptions,
  BulkOperationOptions,
  HealthStatus,
} from '../types/facade-types';

interface TestEntity {
  id: string;
  name: string;
}

describe('RepositoryFacade', () => {
  let facade: RepositoryFacade<TestEntity>;

  beforeEach(() => {
    facade = new RepositoryFacade<TestEntity>();
  });

  describe('Initialization', () => {
    /**
     * Test that RepositoryFacade initializes with default configuration
     */
    it('should initialize with default configuration', () => {
      const config = facade.getConfig();
      expect(config.enableCaching).toBe(true);
      expect(config.enableMetrics).toBe(true);
      expect(config.enableValidation).toBe(true);
      expect(config.enableTransactions).toBe(false);
      expect(config.enableMiddleware).toBe(true);
      expect(config.defaultTimeout).toBe(30000);
      expect(config.maxConnections).toBe(10);
    });

    /**
     * Test that stats are initialized to zero
     */
    it('should initialize stats to zero', () => {
      const stats = facade.getStats();
      expect(stats.totalOperations).toBe(0);
      expect(stats.successfulOperations).toBe(0);
      expect(stats.failedOperations).toBe(0);
      expect(stats.averageExecutionTime).toBe(0);
      expect(stats.cacheHitRate).toBe(0);
      expect(stats.transactionRate).toBe(0);
    });
  });

  describe('CRUD Operations', () => {
    /**
     * Test finding entities
     */
    it('should find entities successfully', async () => {
      const options: FacadeQueryOptions = {};
      const result = await facade.find(options);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    /**
     * Test finding an entity by ID
     */
    it('should find an entity by ID successfully', async () => {
      const result = await facade.findById('1');

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
    });

    /**
     * Test finding one entity
     */
    it('should find one entity successfully', async () => {
      const options: FacadeQueryOptions = {};
      const result = await facade.findOne(options);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
    });

    /**
     * Test saving an entity
     */
    it('should save an entity successfully', async () => {
      const entity: TestEntity = {
        id: '1',
        name: 'Test',
      };

      const result = await facade.save(entity);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(entity);
      expect(result.metadata).toBeDefined();
    });

    /**
     * Test updating an entity
     */
    it('should update an entity successfully', async () => {
      const updates: Partial<TestEntity> = { name: 'Updated' };
      const result = await facade.update('1', updates);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
    });

    /**
     * Test deleting an entity
     */
    it('should delete an entity successfully', async () => {
      const result = await facade.delete('1');

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
    });

    /**
     * Test deleting multiple entities
     */
    it('should delete multiple entities successfully', async () => {
      const options: BulkOperationOptions = {
        batchSize: 10,
        continueOnError: false,
        useTransaction: false,
      };
      const result = await facade.deleteMany(['1', '2'], options);

      expect(result.success).toBe(true);
      expect(result.data).toBe(2);
    });

    /**
     * Test counting entities
     */
    it('should count entities successfully', async () => {
      const options: FacadeQueryOptions = {};
      const result = await facade.count(options);

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });

    /**
     * Test checking if entity exists
     */
    it('should check if entity exists successfully', async () => {
      const options: FacadeQueryOptions = {};
      const result = await facade.exists('1', options);

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    /**
     * Test performing aggregation
     */
    it('should perform aggregation successfully', async () => {
      const aggregation = { total: 100 };
      const options: FacadeQueryOptions = {};
      const result = await facade.aggregate(aggregation, options);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    /**
     * Test performing bulk save
     */
    it('should perform bulk save successfully', async () => {
      const entities: TestEntity[] = [
        { id: '1', name: 'Test1' },
        { id: '2', name: 'Test2' },
      ];

      const options: BulkOperationOptions = {
        batchSize: 10,
        continueOnError: false,
        useTransaction: false,
      };

      const result = await facade.bulkSave(entities, options);

      expect(result.success).toBe(true);
      expect(result.data?.successful).toEqual(entities);
      expect(result.data?.failed).toEqual([]);
    });
  });

  describe('Configuration', () => {
    /**
     * Test updating configuration
     */
    it('should update configuration', () => {
      const newConfig = {
        enableCaching: false,
        enableValidation: false,
        enableMiddleware: false,
      };

      facade.setConfig(newConfig);
      const config = facade.getConfig();

      expect(config.enableCaching).toBe(false);
      expect(config.enableValidation).toBe(false);
      expect(config.enableMiddleware).toBe(false);
    });

    /**
     * Test partial config update
     */
    it('should update partial configuration', () => {
      facade.setConfig({ enableTransactions: true });
      const config = facade.getConfig();

      expect(config.enableTransactions).toBe(true);
      expect(config.enableCaching).toBe(true);
    });
  });

  describe('Statistics', () => {
    /**
     * Test stats track total operations
     */
    it('should track total operations', async () => {
      await facade.findById('1');
      await facade.findById('2');

      const stats = facade.getStats();
      expect(stats.totalOperations).toBe(2);
    });

    /**
     * Test stats track successful operations
     */
    it('should track successful operations', async () => {
      await facade.findById('1');

      const stats = facade.getStats();
      expect(stats.successfulOperations).toBe(1);
    });

    /**
     * Test stats track layer execution counts
     */
    it('should track layer execution counts', async () => {
      await facade.find({});

      const stats = facade.getStats();
      expect(stats.layerExecutionCounts.size).toBeGreaterThan(0);
    });

    /**
     * Test reset stats
     */
    it('should reset stats', async () => {
      await facade.findById('1');
      facade.resetStats();

      const stats = facade.getStats();
      expect(stats.totalOperations).toBe(0);
      expect(stats.successfulOperations).toBe(0);
      expect(stats.failedOperations).toBe(0);
    });
  });

  describe('Health Check', () => {
    /**
     * Test performing health check
     */
    it('should perform health check successfully', async () => {
      const result = await facade.healthCheck();

      expect(result.healthy).toBe(true);
      expect(result.layers).toBeDefined();
      expect(result.overallStatus).toBe(HealthStatus.HEALTHY);
    });
  });

  describe('Cache Management', () => {
    /**
     * Test clearing cache
     */
    it('should clear cache successfully', async () => {
      const result = await facade.clearCache();

      expect(result.success).toBe(true);
    });
  });

  describe('Data Management', () => {
    /**
     * Test clearing data
     */
    it('should clear data successfully', async () => {
      const result = await facade.clearData();

      expect(result.success).toBe(true);
    });

    /**
     * Test getting total count
     */
    it('should get total count successfully', async () => {
      const result = await facade.getTotalCount();

      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });
  });

  describe('Layer Management', () => {
    /**
     * Test getting layer info
     */
    it('should get layer info successfully', () => {
      const layerInfo = facade.getLayerInfo();

      expect(layerInfo).toBeDefined();
      expect(layerInfo.size).toBeGreaterThan(0);
    });

    /**
     * Test enabling a layer
     */
    it('should enable a layer successfully', async () => {
      const result = await facade.enableLayer('cache');

      expect(result.success).toBe(true);
    });

    /**
     * Test disabling a layer
     */
    it('should disable a layer successfully', async () => {
      const result = await facade.disableLayer('cache');

      expect(result.success).toBe(true);
    });
  });

  describe('Reset', () => {
    /**
     * Test resetting facade to default state
     */
    it('should reset facade to default state', async () => {
      await facade.findById('1');
      facade.setConfig({ enableCaching: false });

      facade.reset();

      expect(facade.getStats().totalOperations).toBe(0);
      expect(facade.getConfig().enableCaching).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    /**
     * Test find with caching disabled
     */
    it('should not use cache when caching disabled', async () => {
      facade.setConfig({ enableCaching: false });

      const result = await facade.find({});

      expect(result.success).toBe(true);
      expect(result.metadata.cacheHit).toBe(false);
    });

    /**
     * Test find with validation enabled
     */
    it('should use validation when enabled', async () => {
      const result = await facade.find({});

      expect(result.success).toBe(true);
      expect(result.metadata.layersExecuted).toContain('validation');
    });
  });
});
