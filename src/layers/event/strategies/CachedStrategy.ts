/**
 * EventCachedStrategy
 *
 * Caching event strategy with in-memory cache for frequently accessed events.
 * Reduces latency for repeated event operations.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Configuration options for the cached strategy.
 */
export interface CachedStrategyConfig {
  /** Maximum number of entries in the cache */
  maxCacheSize: number;
  /** Time-to-live for cache entries in milliseconds */
  ttlMs: number;
  /** Whether to cache failed operations */
  cacheErrors: boolean;
  /** Cache key prefix */
  keyPrefix: string;
}

/**
 * Default configuration for cached strategy.
 */
export const DEFAULT_CACHED_CONFIG: CachedStrategyConfig = {
  maxCacheSize: 1000,
  ttlMs: 60000,
  cacheErrors: false,
  keyPrefix: 'event:',
};

/**
 * Cache entry structure.
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  success: boolean;
}

/**
 * Cached event strategy implementation.
 * Provides in-memory caching for event operations.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class EventCachedStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'cached';

  /** @inheritdoc */
  public readonly priority = 15;

  private readonly _config: CachedStrategyConfig;
  private readonly _cache: Map<string, CacheEntry<EventStrategyResult<T>>>;
  private _executionCount: number;
  private _cacheHits: number;
  private _cacheMisses: number;

  /**
   * Creates a new EventCachedStrategy instance.
   *
   * @param config - Optional configuration for cache behavior
   */
  constructor(config: Partial<CachedStrategyConfig> = {}) {
    this._config = { ...DEFAULT_CACHED_CONFIG, ...config };
    this._cache = new Map();
    this._executionCount = 0;
    this._cacheHits = 0;
    this._cacheMisses = 0;
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: EventStrategyContext): boolean {
    return (
      context !== null &&
      context !== undefined &&
      typeof context.operation === 'string' &&
      context.operation.length > 0 &&
      typeof context.eventName === 'string' &&
      context.eventName.length > 0
    );
  }

  /**
   * @inheritdoc
   */
  public async execute(context: EventStrategyContext): Promise<EventStrategyResult<T>> {
    const startTime = Date.now();
    const cacheKey = this._generateCacheKey(context);

    // Check cache first
    const cached = this._getFromCache(cacheKey);
    if (cached) {
      this._cacheHits++;
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          cacheHit: true,
        },
      };
    }

    this._cacheMisses++;

    try {
      // In a real implementation, this would delegate to the actual event bus
      await Promise.resolve();

      const result: EventStrategyResult<T> = {
        success: true,
        data: undefined as T,
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          subscriptionId: context.subscriptionId,
          cacheHit: false,
        },
      };

      // Cache successful results
      if (result.success || this._config.cacheErrors) {
        this._setInCache(cacheKey, result);
      }

      this._executionCount++;
      return result;
    } catch (error) {
      const errorResult: EventStrategyResult<T> = {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: { context },
        },
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          cacheHit: false,
        },
      };

      if (this._config.cacheErrors) {
        this._setInCache(cacheKey, errorResult);
      }

      return errorResult;
    }
  }

  /**
   * Generates a cache key from the context.
   *
   * @param context - The execution context
   * @returns Cache key string
   */
  private _generateCacheKey(context: EventStrategyContext): string {
    const parts = [
      this._config.keyPrefix,
      context.operation,
      context.eventName,
      context.payload ? JSON.stringify(context.payload) : '',
      context.subscriptionId ?? '',
    ];
    return parts.filter(Boolean).join(':');
  }

  /**
   * Retrieves an entry from the cache if valid.
   *
   * @param key - Cache key
   * @returns Cached result or null if not found/expired
   */
  private _getFromCache(key: string): EventStrategyResult<T> | null {
    const entry = this._cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this._config.ttlMs) {
      this._cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Stores an entry in the cache.
   *
   * @param key - Cache key
   * @param result - Result to cache
   */
  private _setInCache(key: string, result: EventStrategyResult<T>): void {
    // Evict oldest entries if cache is full
    if (this._cache.size >= this._config.maxCacheSize) {
      const firstKey = this._cache.keys().next().value;
      if (firstKey !== undefined) {
        this._cache.delete(firstKey);
      }
    }

    this._cache.set(key, {
      data: result,
      timestamp: Date.now(),
      success: result.success,
    });
  }

  /**
   * Clears the cache.
   */
  public clearCache(): void {
    this._cache.clear();
  }

  /**
   * Gets the number of times this strategy has been executed.
   *
   * @returns The execution count
   */
  public getExecutionCount(): number {
    return this._executionCount;
  }

  /**
   * Gets the number of cache hits.
   *
   * @returns The cache hit count
   */
  public getCacheHits(): number {
    return this._cacheHits;
  }

  /**
   * Gets the number of cache misses.
   *
   * @returns The cache miss count
   */
  public getCacheMisses(): number {
    return this._cacheMisses;
  }

  /**
   * Gets the cache hit rate (0-1).
   *
   * @returns The cache hit rate
   */
  public getCacheHitRate(): number {
    const total = this._cacheHits + this._cacheMisses;
    return total > 0 ? this._cacheHits / total : 0;
  }

  /**
   * Gets the current cache size.
   *
   * @returns The number of entries in the cache
   */
  public getCacheSize(): number {
    return this._cache.size;
  }

  /**
   * Gets the current configuration.
   *
   * @returns The configuration
   */
  public getConfig(): CachedStrategyConfig {
    return { ...this._config };
  }
}