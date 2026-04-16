/**
 * Cache Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Cache Layer (Layer 12 of the 25-layer architecture).
 * 
 * The Cache Layer provides multi-level caching with Clean Architecture,
 * including domain entities, configuration management, strategies,
 * statistics collection, storage abstractions, and factory patterns.
 * 
 * @module CacheLayer
 */

// Legacy exports (backward compatibility)
export { ICacheManager } from './interfaces/ICacheManager';
export { CacheManager as LegacyCacheManager } from './implementations/CacheManager';
export { InvalidationStrategy } from './types/cache-types';
export type { CacheResult as LegacyCacheResult } from './types/cache-types';

// New Clean Architecture exports

// Domain Layer (replaces legacy types)
export { CacheEntry, CacheKey } from './domain/entities';
export { TTL, TimeUnit } from './domain/value-objects/TTL';
export { CacheLevel } from './domain/value-objects/CacheLevel';
export { CacheStats } from './domain/value-objects/CacheStats';
export { CacheValidationService } from './domain/services';

// Configuration Layer
export { DefaultConfigs } from './configuration/defaults';
export type { CacheConfigOptions } from './configuration/defaults';
export { CacheConfigValidator } from './configuration/validators';
export { CacheConfigBuilder } from './configuration/builders';

// Strategies Layer
export { IEvictionStrategy } from './strategies/eviction';
export { LRUEvictionStrategy, LFUEvictionStrategy, FIFOEvictionStrategy, RandomEvictionStrategy } from './strategies/eviction';
export { IInvalidationStrategy } from './strategies/invalidation';
export { TimeBasedInvalidationStrategy, ManualInvalidationStrategy, SizeBasedInvalidationStrategy } from './strategies/invalidation';

// Statistics Layer
export { IStatisticsCollector } from './statistics/collectors';
export { BasicStatisticsCollector, DetailedStatisticsCollector, DetailedCacheStats } from './statistics/collectors';
export { CacheMetrics } from './statistics/metrics';

// Storage Layer
export { IStorage } from './storage/interfaces';
export { InMemoryStorage } from './storage/implementations/in-memory';
export { DistributedStorage } from './storage/implementations/distributed';

// Core Layer
export { CacheService } from './core/services';
export type { CacheResult } from './core/services';
export { CacheManager } from './core/managers';

// Factories Layer
export { EvictionStrategyFactory } from './factories/strategies';
export { StorageFactory } from './factories/storage';
export type { StorageType } from './factories/storage';
export { CacheFactory } from './factories/cache';
export type { CacheFactoryOptions } from './factories/cache';

// Utils Layer
export { CacheError, CacheKeyError, CacheConfigError, CacheStorageError, CacheEvictionError } from './utils/errors';
export { CacheHelper } from './utils/helpers';
