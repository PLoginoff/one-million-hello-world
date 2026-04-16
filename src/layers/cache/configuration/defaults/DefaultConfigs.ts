/**
 * Default Cache Configurations
 * 
 * Pre-configured settings for common use cases.
 */

import { InvalidationStrategy } from '../../types/cache-types';

export interface CacheConfigOptions {
  maxSize: number;
  defaultTTL: number;
  invalidationStrategy: InvalidationStrategy;
  enableMultiLevel: boolean;
}

export class DefaultConfigs {
  /**
   * Default configuration for general use
   */
  static DEFAULT: CacheConfigOptions = {
    maxSize: 1000,
    defaultTTL: 60000,
    invalidationStrategy: InvalidationStrategy.LRU,
    enableMultiLevel: false,
  };

  /**
   * High-performance configuration (L1 cache)
   */
  static HIGH_PERFORMANCE: CacheConfigOptions = {
    maxSize: 100,
    defaultTTL: 30000,
    invalidationStrategy: InvalidationStrategy.LRU,
    enableMultiLevel: false,
  };

  /**
   * Large cache configuration (L3 cache)
   */
  static LARGE_CACHE: CacheConfigOptions = {
    maxSize: 10000,
    defaultTTL: 300000,
    invalidationStrategy: InvalidationStrategy.LFU,
    enableMultiLevel: false,
  };

  /**
   * Multi-level cache configuration
   */
  static MULTI_LEVEL: CacheConfigOptions = {
    maxSize: 1000,
    defaultTTL: 60000,
    invalidationStrategy: InvalidationStrategy.LRU,
    enableMultiLevel: true,
  };

  /**
   * Time-based only configuration
   */
  static TIME_BASED: CacheConfigOptions = {
    maxSize: 500,
    defaultTTL: 120000,
    invalidationStrategy: InvalidationStrategy.TIME_BASED,
    enableMultiLevel: false,
  };

  /**
   * Custom configuration builder
   */
  static custom(options: Partial<CacheConfigOptions>): CacheConfigOptions {
    return {
      ...DefaultConfigs.DEFAULT,
      ...options,
    } as CacheConfigOptions;
  }
}
