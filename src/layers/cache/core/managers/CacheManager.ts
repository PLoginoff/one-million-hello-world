/**
 * Cache Manager
 * 
 * Main cache manager orchestrating all cache operations.
 * Refactored to use layered architecture.
 */

import { CacheService } from '../services/CacheService';
import { InMemoryStorage } from '../../storage/implementations/in-memory/InMemoryStorage';
import { LRUEvictionStrategy } from '../../strategies/eviction/LRUEvictionStrategy';
import { LFUEvictionStrategy } from '../../strategies/eviction/LFUEvictionStrategy';
import { TimeBasedInvalidationStrategy } from '../../strategies/invalidation/TimeBasedInvalidationStrategy';
import { BasicStatisticsCollector } from '../../statistics/collectors/BasicStatisticsCollector';
import { DefaultConfigs } from '../../configuration/defaults/DefaultConfigs';
import { InvalidationStrategy } from '../../types/cache-types';
import { CacheStats } from '../../domain/value-objects/CacheStats';
import { CacheEntry } from '../../domain/entities/CacheEntry';
import { CacheConfigOptions } from '../../configuration/defaults/DefaultConfigs';
import type { CacheResult } from '../services/CacheService';

export class CacheManager<T = unknown> {
  private cacheService: CacheService<T>;
  private config: CacheConfigOptions;

  constructor(config?: Partial<CacheConfigOptions>) {
    this.config = config 
      ? DefaultConfigs.custom(config) 
      : DefaultConfigs.DEFAULT;

    const storage = new InMemoryStorage<T>();
    const evictionStrategy = this.createEvictionStrategy(this.config.invalidationStrategy);
    const invalidationStrategy = new TimeBasedInvalidationStrategy<T>();
    const statsCollector = new BasicStatisticsCollector();

    this.cacheService = new CacheService<T>(
      storage,
      evictionStrategy,
      invalidationStrategy,
      statsCollector,
      this.config,
    );
  }

  /**
   * Get value from cache
   */
  get(key: string): CacheResult<T> {
    return this.cacheService.get(key);
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    this.cacheService.set(key, value, ttl);
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): void {
    this.cacheService.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cacheService.clear();
  }

  /**
   * Invalidate entries by pattern
   */
  invalidate(pattern: string): void {
    this.cacheService.invalidate(pattern);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.cacheService.getStats() as CacheStats;
  }

  /**
   * Set cache configuration
   */
  setConfig(config: Partial<CacheConfigOptions>): void {
    this.config = { ...this.config, ...config };
    this.cacheService.updateConfig(this.config);
  }

  /**
   * Get current cache configuration
   */
  getConfig(): CacheConfigOptions {
    return this.cacheService.getConfig();
  }

  /**
   * Get all cache entries
   */
  getEntries(): CacheEntry<T>[] {
    return this.cacheService.getEntries();
  }

  /**
   * Create eviction strategy based on configuration
   */
  private createEvictionStrategy(strategy: InvalidationStrategy): any {
    switch (strategy) {
      case InvalidationStrategy.LRU:
        return new LRUEvictionStrategy<T>();
      case InvalidationStrategy.LFU:
        return new LFUEvictionStrategy<T>();
      default:
        return new LRUEvictionStrategy<T>();
    }
  }
}
