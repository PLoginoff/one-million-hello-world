/**
 * Segmented Cache Strategy
 *
 * Implements a segmented/sharded cache that divides the keyspace into multiple
 * independent segments, each with its own eviction policy. This reduces lock
 * contention and allows different segments to have different configurations.
 *
 * @module CacheLayer/Strategies
 */

import { ICacheStrategy, CacheStrategyConfig, CacheGetResult, CacheSetResult } from './ICacheStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';
import { CacheStats } from '../../domain/value-objects/CacheStats';
import { CacheError, CacheErrorCode } from '../../errors';
import { LRUCacheStrategy } from './LRUCacheStrategy';
import { LFUCacheStrategy } from './LFUCacheStrategy';
import { TTLCacheStrategy } from './TTLCacheStrategy';
import { FIFOCacheStrategy } from './FIFOCacheStrategy';
import { RandomCacheStrategy } from './RandomCacheStrategy';

/**
 * Segment configuration
 */
export interface SegmentConfig {
  /** Segment identifier */
  id: string;
  /** Strategy type for this segment */
  strategy: 'LRU' | 'LFU' | 'TTL' | 'FIFO' | 'Random';
  /** Maximum size for this segment */
  maxSize: number;
  /** Default TTL for this segment */
  defaultTTL: number;
  /** Key prefix or pattern for this segment */
  keyPattern?: string | RegExp;
  /** Custom hash function for key-to-segment mapping */
  hashFunction?: (key: string) => number;
}

/**
 * Segmented Cache Strategy Configuration
 */
export interface SegmentedCacheConfig extends CacheStrategyConfig {
  /** Array of segment configurations */
  segments: SegmentConfig[];
  /** Default segment for keys that don't match any pattern */
  defaultSegment: string;
  /** Whether to enable cross-segment operations */
  enableCrossSegmentOps: boolean;
}

/**
 * Internal segment wrapper
 */
interface Segment<T> {
  config: SegmentConfig;
  strategy: ICacheStrategy<T>;
  stats: CacheStats;
}

/**
 * Segmented Cache Strategy Implementation
 *
 * Divides the cache into multiple independent segments, each with its own
 * eviction strategy and configuration. Keys are routed to segments based on
 * patterns or hash functions.
 */
export class SegmentedCacheStrategy<T = unknown> implements ICacheStrategy<T> {
  readonly name = 'Segmented';
  readonly version = '1.0.0';

  private _config!: SegmentedCacheConfig;
  private _segments: Map<string, Segment<T>>;
  private _defaultSegmentId: string;
  private _stats: CacheStats;
  private _initialized: boolean;

  constructor() {
    this._segments = new Map();
    this._defaultSegmentId = '';
    this._stats = new CacheStats();
    this._initialized = false;
  }

  /**
   * Initialize the strategy with configuration
   */
  async initialize(config: SegmentedCacheConfig): Promise<void> {
    if (this._initialized) {
      throw new CacheError(CacheErrorCode.INVALID_CONFIG, 'Strategy already initialized');
    }

    this._config = {
      maxSize: config.maxSize,
      defaultTTL: config.defaultTTL,
      enableMetrics: config.enableMetrics ?? true,
      serializer: config.serializer,
      deserializer: config.deserializer,
      segments: config.segments,
      defaultSegment: config.defaultSegment,
      enableCrossSegmentOps: config.enableCrossSegmentOps ?? true,
    };

    this._defaultSegmentId = this._config.defaultSegment;

    // Validate segments
    if (this._config.segments.length === 0) {
      throw new CacheError(CacheErrorCode.INVALID_CONFIG, 'At least one segment must be configured');
    }

    const defaultSegmentExists = this._config.segments.some(s => s.id === this._defaultSegmentId);
    if (!defaultSegmentExists) {
      throw new CacheError(
        CacheErrorCode.INVALID_CONFIG,
        `Default segment '${this._defaultSegmentId}' not found in segments`
      );
    }

    // Initialize each segment
    for (const segmentConfig of this._config.segments) {
      const strategy = this._createStrategy(segmentConfig);
      const segmentConfigForStrategy: CacheStrategyConfig = {
        maxSize: segmentConfig.maxSize,
        defaultTTL: segmentConfig.defaultTTL,
        enableMetrics: this._config.enableMetrics,
        serializer: this._config.serializer,
        deserializer: this._config.deserializer,
      };

      await strategy.initialize(segmentConfigForStrategy);

      this._segments.set(segmentConfig.id, {
        config: segmentConfig,
        strategy,
        stats: new CacheStats(),
      });
    }

    this._initialized = true;
  }

  /**
   * Get a value from the cache
   */
  async get(key: string): Promise<CacheGetResult<T>> {
    this._ensureInitialized();

    const segment = this._getSegmentForKey(key);
    const result = await segment.strategy.get(key);

    if (result.hit) {
      this._stats = this._stats.withHit();
      segment.stats = segment.stats.withHit();
    } else {
      this._stats = this._stats.withMiss();
      segment.stats = segment.stats.withMiss();
    }

    return result;
  }

  /**
   * Set a value in the cache
   */
  async set(key: string, value: T, ttl?: number): Promise<CacheSetResult> {
    this._ensureInitialized();

    const segment = this._getSegmentForKey(key);
    const result = await segment.strategy.set(key, value, ttl);

    if (result.success) {
      segment.stats = segment.stats.withSize(await segment.strategy.size());
      this._stats = this._stats.withSize(await this.size());
    }

    if (result.evicted) {
      this._stats = this._stats.withEviction();
      segment.stats = segment.stats.withEviction();
    }

    return result;
  }

  /**
   * Delete a value from the cache
   */
  async delete(key: string): Promise<boolean> {
    this._ensureInitialized();

    const segment = this._getSegmentForKey(key);
    const deleted = await segment.strategy.delete(key);

    if (deleted) {
      segment.stats = segment.stats.withSize(await segment.strategy.size());
      this._stats = this._stats.withSize(await this.size());
    }

    return deleted;
  }

  /**
   * Clear all entries from all segments
   */
  async clear(): Promise<void> {
    this._ensureInitialized();

    for (const segment of this._segments.values()) {
      await segment.strategy.clear();
      segment.stats = new CacheStats();
    }

    this._stats = new CacheStats();
  }

  /**
   * Get combined cache statistics
   */
  getStats(): CacheStats {
    return this._stats;
  }

  /**
   * Get statistics for a specific segment
   */
  getSegmentStats(segmentId: string): CacheStats | null {
    const segment = this._segments.get(segmentId);
    return segment ? segment.stats : null;
  }

  /**
   * Get all segment statistics
   */
  getAllSegmentStats(): Map<string, CacheStats> {
    const result = new Map<string, CacheStats>();
    for (const [id, segment] of this._segments.entries()) {
      result.set(id, segment.stats);
    }
    return result;
  }

  /**
   * Check if a key exists in the cache
   */
  async has(key: string): Promise<boolean> {
    this._ensureInitialized();

    const segment = this._getSegmentForKey(key);
    return segment.strategy.has(key);
  }

  /**
   * Get all keys from all segments
   */
  async keys(): Promise<string[]> {
    this._ensureInitialized();

    const allKeys: string[] = [];
    for (const segment of this._segments.values()) {
      const keys = await segment.strategy.keys();
      allKeys.push(...keys);
    }
    return allKeys;
  }

  /**
   * Get the current number of entries across all segments
   */
  async size(): Promise<number> {
    this._ensureInitialized();

    let totalSize = 0;
    for (const segment of this._segments.values()) {
      totalSize += await segment.strategy.size();
    }

    this._stats = this._stats.withSize(totalSize);
    return totalSize;
  }

  /**
   * Perform maintenance on all segments
   */
  async maintenance(): Promise<number> {
    this._ensureInitialized();

    let totalCleaned = 0;
    for (const segment of this._segments.values()) {
      totalCleaned += await segment.strategy.maintenance();
    }

    this._stats = this._stats.withSize(await this.size());
    return totalCleaned;
  }

  /**
   * Shutdown the strategy and release resources
   */
  async shutdown(): Promise<void> {
    for (const segment of this._segments.values()) {
      await segment.strategy.shutdown();
    }
    this._segments.clear();
    this._initialized = false;
  }

  /**
   * Get a segment by ID
   */
  getSegment(segmentId: string): ICacheStrategy<T> | null {
    const segment = this._segments.get(segmentId);
    return segment ? segment.strategy : null;
  }

  /**
   * Get all segment IDs
   */
  getSegmentIds(): string[] {
    return Array.from(this._segments.keys());
  }

  // Private helper methods

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new CacheError(CacheErrorCode.INVALID_CONFIG, 'Strategy not initialized. Call initialize() first.');
    }
  }

  private _getSegmentForKey(key: string): Segment<T> {
    // First, try to match by key pattern
    for (const segment of this._segments.values()) {
      if (segment.config.keyPattern) {
        if (typeof segment.config.keyPattern === 'string') {
          if (key.startsWith(segment.config.keyPattern)) {
            return segment;
          }
        } else if (segment.config.keyPattern instanceof RegExp) {
          if (segment.config.keyPattern.test(key)) {
            return segment;
          }
        }
      }
    }

    // If custom hash function provided, use it
    for (const segment of this._segments.values()) {
      if (segment.config.hashFunction) {
        const hash = segment.config.hashFunction(key);
        const segmentIndex = Math.abs(hash) % this._segments.size;
        const segmentIds = Array.from(this._segments.keys());
        if (segmentIds[segmentIndex] === segment.config.id) {
          return segment;
        }
      }
    }

    // Fall back to default segment
    const defaultSegment = this._segments.get(this._defaultSegmentId);
    if (!defaultSegment) {
      throw new CacheError(CacheErrorCode.UNKNOWN, `Default segment '${this._defaultSegmentId}' not found`);
    }
    return defaultSegment;
  }

  private _createStrategy(config: SegmentConfig): ICacheStrategy<T> {
    switch (config.strategy) {
      case 'LRU':
        return new LRUCacheStrategy<T>();
      case 'LFU':
        return new LFUCacheStrategy<T>();
      case 'TTL':
        return new TTLCacheStrategy<T>();
      case 'FIFO':
        return new FIFOCacheStrategy<T>();
      case 'Random':
        return new RandomCacheStrategy<T>();
      default:
        throw new CacheError(CacheErrorCode.INVALID_CONFIG, `Unknown strategy type: ${config.strategy}`);
    }
  }
}