/**
 * Cache Factory
 * 
 * Factory for creating fully configured cache instances.
 */

import { CacheManager } from '../../core/managers/CacheManager';
import { CacheService } from '../../core/services/CacheService';
import { InMemoryStorage } from '../../storage/implementations/in-memory/InMemoryStorage';
import { DistributedStorage } from '../../storage/implementations/distributed/DistributedStorage';
import { EvictionStrategyFactory } from '../strategies/EvictionStrategyFactory';
import { TimeBasedInvalidationStrategy } from '../../strategies/invalidation/TimeBasedInvalidationStrategy';
import { BasicStatisticsCollector } from '../../statistics/collectors/BasicStatisticsCollector';
import { DetailedStatisticsCollector } from '../../statistics/collectors/DetailedStatisticsCollector';
import { DefaultConfigs, CacheConfigOptions } from '../../configuration/defaults/DefaultConfigs';
import { InvalidationStrategy } from '../../types/cache-types';
import type { StorageType } from '../storage/StorageFactory';

export interface CacheFactoryOptions {
  storageType?: StorageType;
  useDetailedStats?: boolean;
  nodeId?: string;
}

export class CacheFactory {
  /**
   * Create cache with default configuration
   */
  static create<T>(config?: Partial<CacheConfigOptions>, options?: CacheFactoryOptions): CacheManager<T> {
    const cacheConfig = config ? DefaultConfigs.custom(config) : DefaultConfigs.DEFAULT;
    const storage = this.createStorage<T>(options?.storageType, options?.nodeId);
    const evictionStrategy = EvictionStrategyFactory.create<T>(cacheConfig.invalidationStrategy);
    const invalidationStrategy = new TimeBasedInvalidationStrategy<T>();
    const statsCollector = this.createStatsCollector(options?.useDetailedStats);

    const cacheService = new CacheService<T>(
      storage,
      evictionStrategy,
      invalidationStrategy,
      statsCollector,
      cacheConfig,
    );

    return new CacheManager<T>(cacheConfig);
  }

  /**
   * Create high-performance cache (L1)
   */
  static createHighPerformance<T>(options?: CacheFactoryOptions): CacheManager<T> {
    return this.create<T>(DefaultConfigs.HIGH_PERFORMANCE, options);
  }

  /**
   * Create large cache (L3)
   */
  static createLargeCache<T>(options?: CacheFactoryOptions): CacheManager<T> {
    return this.create<T>(DefaultConfigs.LARGE_CACHE, options);
  }

  /**
   * Create multi-level cache
   */
  static createMultiLevel<T>(options?: CacheFactoryOptions): CacheManager<T> {
    return this.create<T>(DefaultConfigs.MULTI_LEVEL, options);
  }

  /**
   * Create time-based only cache
   */
  static createTimeBased<T>(options?: CacheFactoryOptions): CacheManager<T> {
    return this.create<T>(DefaultConfigs.TIME_BASED, options);
  }

  /**
   * Create custom cache with builder
   */
  static createCustom<T>(config: CacheConfigOptions, options?: CacheFactoryOptions): CacheManager<T> {
    return this.create<T>(config, options);
  }

  private static createStorage<T>(type?: StorageType, nodeId?: string): any {
    const storageType = type || 'IN_MEMORY';
    if (storageType === 'DISTRIBUTED') {
      return new DistributedStorage<T>(nodeId);
    }
    return new InMemoryStorage<T>();
  }

  private static createStatsCollector(detailed?: boolean): any {
    if (detailed) {
      return new DetailedStatisticsCollector();
    }
    return new BasicStatisticsCollector();
  }
}
