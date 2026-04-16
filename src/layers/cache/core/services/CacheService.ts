/**
 * Cache Service
 * 
 * Core service for cache operations using layered architecture.
 */

import { CacheEntry } from '../../domain/entities/CacheEntry';
import { CacheKey } from '../../domain/entities/CacheKey';
import { CacheLevel } from '../../domain/value-objects/CacheLevel';
import { IStorage } from '../../storage/interfaces/IStorage';
import { IEvictionStrategy } from '../../strategies/eviction/IEvictionStrategy';
import { IInvalidationStrategy } from '../../strategies/invalidation/IInvalidationStrategy';
import { IStatisticsCollector } from '../../statistics/collectors/IStatisticsCollector';
import { CacheConfigOptions } from '../../configuration/defaults/DefaultConfigs';

export interface CacheResult<T> {
  hit: boolean;
  value?: T;
  fromLevel?: CacheLevel;
}

export class CacheService<T> {
  private storage: IStorage<T>;
  private evictionStrategy: IEvictionStrategy<T>;
  private invalidationStrategy: IInvalidationStrategy<T>;
  private statsCollector: IStatisticsCollector;
  private config: CacheConfigOptions;

  constructor(
    storage: IStorage<T>,
    evictionStrategy: IEvictionStrategy<T>,
    invalidationStrategy: IInvalidationStrategy<T>,
    statsCollector: IStatisticsCollector,
    config: CacheConfigOptions,
  ) {
    this.storage = storage;
    this.evictionStrategy = evictionStrategy;
    this.invalidationStrategy = invalidationStrategy;
    this.statsCollector = statsCollector;
    this.config = config;
  }

  /**
   * Get value from cache
   */
  get(key: string): CacheResult<T> {
    const entry = this.storage.get(key);
    const now = Date.now();

    if (!entry) {
      this.statsCollector.recordMiss();
      return { hit: false };
    }

    if (this.invalidationStrategy.shouldInvalidate(entry, now)) {
      this.storage.delete(key);
      this.statsCollector.recordMiss();
      this.statsCollector.updateSize(this.storage.size());
      return { hit: false };
    }

    entry.recordAccess(now);
    this.evictionStrategy.onAccess(key, entry);
    this.statsCollector.recordHit();

    return {
      hit: true,
      value: entry.value,
      fromLevel: CacheLevel.L1(),
    };
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const entryTTL = ttl ?? this.config.defaultTTL;
    const entry = new CacheEntry<T>(key, value, entryTTL, now);

    if (this.storage.size() >= this.config.maxSize) {
      this.evict();
    }

    this.storage.set(key, entry);
    this.evictionStrategy.onAdd(key, entry);
    this.statsCollector.updateSize(this.storage.size());
  }

  /**
   * Delete entry from cache
   */
  delete(key: string): boolean {
    const deleted = this.storage.delete(key);
    this.statsCollector.updateSize(this.storage.size());
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.storage.clear();
    this.statsCollector.updateSize(0);
    this.evictionStrategy.reset();
  }

  /**
   * Invalidate entries by pattern
   */
  invalidate(pattern: string): void {
    const regex = new RegExp(pattern);
    const keys = this.storage.keys();

    for (const key of keys) {
      if (regex.test(key)) {
        this.storage.delete(key);
      }
    }

    this.statsCollector.updateSize(this.storage.size());
  }

  /**
   * Evict entry based on strategy
   */
  private evict(): void {
    const entries = new Map<string, CacheEntry<T>>();
    for (const key of this.storage.keys()) {
      const entry = this.storage.get(key);
      if (entry) {
        entries.set(key, entry);
      }
    }

    const keyToEvict = this.evictionStrategy.selectEntryToEvict(entries);
    if (keyToEvict) {
      this.storage.delete(keyToEvict);
      this.statsCollector.recordEviction();
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return this.statsCollector.getStats();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CacheConfigOptions>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get configuration
   */
  getConfig(): CacheConfigOptions {
    return { ...this.config };
  }

  /**
   * Get all entries
   */
  getEntries(): CacheEntry<T>[] {
    return this.storage.entries();
  }
}
