/**
 * Cache Configuration Builder
 * 
 * Fluent builder for creating cache configurations.
 */

import { InvalidationStrategy } from '../../types/cache-types';
import { CacheConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { CacheConfigValidator } from '../validators/CacheConfigValidator';

export class CacheConfigBuilder {
  private config: CacheConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): CacheConfigBuilder {
    return new CacheConfigBuilder();
  }

  /**
   * Start with high-performance configuration
   */
  static highPerformance(): CacheConfigBuilder {
    const builder = new CacheConfigBuilder();
    builder.config = { ...DefaultConfigs.HIGH_PERFORMANCE };
    return builder;
  }

  /**
   * Start with large cache configuration
   */
  static largeCache(): CacheConfigBuilder {
    const builder = new CacheConfigBuilder();
    builder.config = { ...DefaultConfigs.LARGE_CACHE };
    return builder;
  }

  /**
   * Start with multi-level configuration
   */
  static multiLevel(): CacheConfigBuilder {
    const builder = new CacheConfigBuilder();
    builder.config = { ...DefaultConfigs.MULTI_LEVEL };
    return builder;
  }

  /**
   * Set max size
   */
  withMaxSize(maxSize: number): CacheConfigBuilder {
    CacheConfigValidator.validateMaxSize(maxSize);
    this.config.maxSize = maxSize;
    return this;
  }

  /**
   * Set default TTL in milliseconds
   */
  withDefaultTTL(ttl: number): CacheConfigBuilder {
    CacheConfigValidator.validateDefaultTTL(ttl);
    this.config.defaultTTL = ttl;
    return this;
  }

  /**
   * Set default TTL in seconds
   */
  withDefaultTTLSeconds(seconds: number): CacheConfigBuilder {
    return this.withDefaultTTL(seconds * 1000);
  }

  /**
   * Set invalidation strategy
   */
  withInvalidationStrategy(strategy: InvalidationStrategy): CacheConfigBuilder {
    CacheConfigValidator.validateInvalidationStrategy(strategy);
    this.config.invalidationStrategy = strategy;
    return this;
  }

  /**
   * Enable or disable multi-level caching
   */
  withMultiLevel(enabled: boolean): CacheConfigBuilder {
    CacheConfigValidator.validateMultiLevel(enabled);
    this.config.enableMultiLevel = enabled;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): CacheConfigOptions {
    CacheConfigValidator.validate(this.config);
    return { ...this.config };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): CacheConfigOptions {
    return { ...this.config };
  }
}
