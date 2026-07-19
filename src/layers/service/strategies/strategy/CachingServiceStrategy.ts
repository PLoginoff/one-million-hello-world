/**
 * Caching Service Strategy
 *
 * Decorates another strategy with caching of execution results.
 * Cache key is derived from service ID and serialized input.
 */

import { IServiceStrategy } from './IServiceStrategy';
import { ServiceEntity } from '../../domain/entities/ServiceEntity';

export interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class CachingServiceStrategy implements IServiceStrategy {
  private readonly _inner: IServiceStrategy;
  private readonly _cache: Map<string, CacheEntry>;
  private readonly _ttlMs: number;
  private _hits: number;
  private _misses: number;

  constructor(inner: IServiceStrategy, ttlMs: number = 60000) {
    this._inner = inner;
    this._cache = new Map();
    this._ttlMs = ttlMs;
    this._hits = 0;
    this._misses = 0;
  }

  getName(): string {
    return `CACHING(${this._inner.getName()})`;
  }

  async execute(service: ServiceEntity, input: unknown): Promise<unknown> {
    const key = this._buildKey(service, input);
    const now = Date.now();

    const cached = this._cache.get(key);
    if (cached !== undefined && cached.expiresAt > now) {
      this._hits++;
      return cached.value;
    }

    this._misses++;
    const result = await this._inner.execute(service, input);
    this._cache.set(key, { value: result, expiresAt: now + this._ttlMs });
    return result;
  }

  private _buildKey(service: ServiceEntity, input: unknown): string {
    const inputKey = typeof input === 'string' ? input : JSON.stringify(input);
    return `${service.data.id}:${inputKey}`;
  }

  getCacheHits(): number {
    return this._hits;
  }

  getCacheMisses(): number {
    return this._misses;
  }

  getCacheSize(): number {
    return this._cache.size;
  }

  clearCache(): void {
    this._cache.clear();
    this._hits = 0;
    this._misses = 0;
  }

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
}
