/**
 * Cache Fallback Strategy
 * 
 * Fallback strategy that returns cached data when available.
 */

import { IFallbackStrategy, FallbackContext, FallbackResult } from './IFallbackStrategy';

export interface CacheFallbackOptions {
  cache: Map<string, unknown>;
  ttl?: number;
}

export class CacheFallbackStrategy<T> implements IFallbackStrategy<T> {
  readonly name: string;
  private readonly _cache: Map<string, unknown>;
  private readonly _ttl: number;

  constructor(options: CacheFallbackOptions) {
    this.name = 'CacheFallbackStrategy';
    this._cache = options.cache;
    this._ttl = options.ttl || 60000;
  }

  async execute(context: FallbackContext<T>): Promise<FallbackResult<T>> {
    const cacheKey = this._generateCacheKey(context);
    const cached = this._cache.get(cacheKey);

    if (cached === undefined) {
      return {
        success: false,
        error: 'No cached data available',
        fromFallback: true,
        strategyName: this.name,
      };
    }

    const cacheEntry = cached as { value: T; timestamp: number };
    if (this._ttl > 0) {
      const age = Date.now() - cacheEntry.timestamp;
      if (age > this._ttl) {
        this._cache.delete(cacheKey);
        return {
          success: false,
          error: 'Cached data expired',
          fromFallback: true,
          strategyName: this.name,
        };
      }
    }

    return {
      success: true,
      data: cacheEntry.value,
      fromFallback: true,
      strategyName: this.name,
    };
  }

  isAvailable(): boolean {
    return this._cache.size > 0;
  }

  getName(): string {
    return this.name;
  }

  private _generateCacheKey(context: FallbackContext<T>): string {
    return `fallback:${context.originalError.message}:${context.attemptCount}`;
  }
}
