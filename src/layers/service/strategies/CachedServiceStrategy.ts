/**
 * Cached Service Strategy
 *
 * Decorates a service strategy with a caching layer.
 * Caches successful execution results based on input and context.
 *
 * @module ServiceLayer/Strategies
 */

import { IServiceStrategy } from './IServiceStrategy';
import { ServiceContext } from '../types/service-types';
import { ServiceResult } from '../types/service-types';

/**
 * Cache entry with value and expiration.
 */
interface CacheEntry<T> {
  /** The cached result */
  value: ServiceResult<T>;
  /** Expiration timestamp in milliseconds */
  expiresAt: number;
}

/**
 * Configuration options for caching behavior.
 */
export interface CacheOptions {
  /** Time-to-live for cache entries in milliseconds (default: 60000) */
  ttlMs: number;
  /** Maximum number of cache entries (default: 1000) */
  maxEntries: number;
  /** Function to generate cache key from input and context (default: JSON.stringify) */
  keyGenerator?: (input: unknown, context: ServiceContext) => string;
  /** Function to determine if a result should be cached (default: cache successful results) */
  shouldCache?: (result: ServiceResult<unknown>) => boolean;
}

/**
 * Metrics collected by the cache strategy.
 */
export interface CacheMetrics {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Current number of entries in cache */
  size: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
}

/**
 * Default cache options.
 */
const DEFAULT_CACHE_OPTIONS: CacheOptions = {
  ttlMs: 60000,
  maxEntries: 1000,
};

/**
 * Cached service strategy that wraps another strategy with caching.
 */
export class CachedServiceStrategy<TInput = unknown, TOutput = unknown> implements IServiceStrategy<TInput, TOutput> {
  private readonly _inner: IServiceStrategy<TInput, TOutput>;
  private readonly _options: CacheOptions;
  private readonly _cache: Map<string, CacheEntry<TOutput>>;
  private _hits: number;
  private _misses: number;

  /**
   * Creates a new CachedServiceStrategy instance.
   *
   * @param inner - The strategy to wrap with caching
   * @param options - Optional cache configuration
   */
  constructor(inner: IServiceStrategy<TInput, TOutput>, options?: Partial<CacheOptions>) {
    this._inner = inner;
    this._options = { ...DEFAULT_CACHE_OPTIONS, ...options };
    this._cache = new Map();
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Gets the strategy name, including the wrapped strategy name.
   *
   * @returns The combined strategy name
   */
  getName(): string {
    return `CACHED(${this._inner.getName()})`;
  }

  /**
   * Gets the strategy priority from the wrapped strategy.
   *
   * @returns The wrapped strategy's priority
   */
  getPriority(): number {
    return this._inner.getPriority();
  }

  /**
   * Executes the wrapped strategy with caching.
   *
   * @param input - The input data for the service operation
   * @param context - The service execution context
   * @returns Promise resolving to the service result
   */
  async execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>> {
    const key = this._generateKey(input, context);
    const now = Date.now();

    // Check cache
    const cached = this._cache.get(key);
    if (cached !== undefined && cached.expiresAt > now) {
      this._hits++;
      return cached.value;
    }

    // Cache miss - execute inner strategy
    this._misses++;
    const result = await this._inner.execute(input, context);

    // Cache successful results
    if (this._shouldCache(result)) {
      this._setCache(key, result, now);
    }

    return result;
  }

  /**
   * Generates a cache key from input and context.
   *
   * @param input - The input data
   * @param context - The service context
   * @returns Cache key string
   */
  private _generateKey(input: TInput, context: ServiceContext): string {
    if (this._options.keyGenerator) {
      return this._options.keyGenerator(input, context);
    }

    // Default key generation: use input and relevant context fields
    const inputKey = typeof input === 'string' ? input : JSON.stringify(input);
    const contextKey = `${context.correlationId}:${context.requestId}:${context.userId ?? 'anonymous'}`;
    return `${inputKey}|${contextKey}`;
  }

  /**
   * Determines if a result should be cached.
   *
   * @param result - The service result
   * @returns True if the result should be cached
   */
  private _shouldCache(result: ServiceResult<unknown>): boolean {
    if (this._options.shouldCache) {
      return this._options.shouldCache(result);
    }
    // Default: cache successful results
    return result.success;
  }

  /**
   * Sets a cache entry with expiration.
   *
   * @param key - Cache key
   * @param value - Result to cache
   * @param now - Current timestamp
   */
  private _setCache(key: string, value: ServiceResult<TOutput>, now: number): void {
    // Evict oldest entries if at capacity
    if (this._cache.size >= this._options.maxEntries) {
      this._evictOldest();
    }

    this._cache.set(key, {
      value,
      expiresAt: now + this._options.ttlMs,
    });
  }

  /**
   * Evicts the oldest cache entry.
   */
  private _evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this._cache) {
      if (entry.expiresAt < oldestTime) {
        oldestTime = entry.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this._cache.delete(oldestKey);
    }
  }

  /**
   * Gets the current cache metrics.
   *
   * @returns Current cache metrics
   */
  getMetrics(): CacheMetrics {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      size: this._cache.size,
      hitRate: total > 0 ? this._hits / total : 0,
    };
  }

  /**
   * Clears the cache and resets metrics.
   */
  clearCache(): void {
    this._cache.clear();
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Evicts expired cache entries.
   *
   * @returns Number of entries evicted
   */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this._cache) {
      if (entry.expiresAt <= now) {
        this._cache.delete(key);
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Gets a snapshot of the cache contents (for debugging).
   *
   * @returns Array of cache keys and their expiration times
   */
  getCacheSnapshot(): Array<{ key: string; expiresAt: number; expired: boolean }> {
    const now = Date.now();
    return Array.from(this._cache.entries()).map(([key, entry]) => ({
      key,
      expiresAt: entry.expiresAt,
      expired: entry.expiresAt <= now,
    }));
  }
}
