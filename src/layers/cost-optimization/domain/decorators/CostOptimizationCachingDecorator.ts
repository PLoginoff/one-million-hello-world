/**
 * CostOptimizationCachingDecorator
 */

import { ICostOptimizationComponent } from './CostOptimizationLoggingDecorator';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
  hitCount: number;
}

export class CostOptimizationCachingDecorator implements ICostOptimizationComponent {
  private _wrapped: ICostOptimizationComponent;
  private _cache: Map<string, CacheEntry>;
  private _ttlMs: number;
  private _hits: number;
  private _misses: number;

  constructor(wrapped: ICostOptimizationComponent, ttlMs: number = 60000) {
    this._wrapped = wrapped;
    this._cache = new Map();
    this._ttlMs = ttlMs;
    this._hits = 0;
    this._misses = 0;
  }

  async execute(input: unknown): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const key = this._cacheKey(input);
    const entry = this._cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      entry.hitCount++;
      this._hits++;
      return { success: true, data: entry.data };
    }
    this._misses++;
    const result = await this._wrapped.execute(input);
    if (result.success) {
      this._cache.set(key, { data: result.data, expiresAt: Date.now() + this._ttlMs, hitCount: 0 });
    }
    return result;
  }

  getName(): string {
    return this._wrapped.getName() + '+caching';
  }

  getHitRate(): number {
    const total = this._hits + this._misses;
    return total > 0 ? this._hits / total : 0;
  }

  getCacheSize(): number {
    return this._cache.size;
  }
  getHits(): number {
    return this._hits;
  }
  getMisses(): number {
    return this._misses;
  }

  clearCache(): void {
    this._cache.clear();
    this._hits = 0;
    this._misses = 0;
  }
  setTtl(ttlMs: number): void {
    this._ttlMs = ttlMs;
  }

  private _cacheKey(input: unknown): string {
    return typeof input === 'string' ? input : JSON.stringify(input);
  }
}
