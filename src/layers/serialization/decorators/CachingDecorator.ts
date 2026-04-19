/**
 * Caching Decorator
 * 
 * Decorator that adds caching functionality to serialization strategies.
 */

import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { ContentType } from '../types/serialization-types';

export interface ICacheProvider {
  get(key: string): string | null;
  set(key: string, value: string): void;
  has(key: string): boolean;
  clear(): void;
}

export class InMemoryCacheProvider implements ICacheProvider {
  private _cache: Map<string, string>;
  private _maxSize: number;

  constructor(maxSize: number = 100) {
    this._cache = new Map();
    this._maxSize = maxSize;
  }

  get(key: string): string | null {
    return this._cache.get(key) ?? null;
  }

  set(key: string, value: string): void {
    if (this._cache.size >= this._maxSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
    this._cache.set(key, value);
  }

  has(key: string): boolean {
    return this._cache.has(key);
  }

  clear(): void {
    this._cache.clear();
  }
}

export class CachingDecorator implements ISerializationStrategy {
  private _strategy: ISerializationStrategy;
  private _cache: ICacheProvider;
  private _enabled: boolean;
  private _ttl?: number;

  constructor(strategy: ISerializationStrategy, cache?: ICacheProvider, ttl?: number) {
    this._strategy = strategy;
    this._cache = cache ?? new InMemoryCacheProvider();
    this._enabled = true;
    this._ttl = ttl;
  }

  serialize(data: unknown): string {
    if (!this._enabled) {
      return this._strategy.serialize(data);
    }

    const cacheKey = this._generateCacheKey(data);
    
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey)!;
    }

    const result = this._strategy.serialize(data);
    this._cache.set(cacheKey, result);
    
    return result;
  }

  deserialize(data: string): unknown {
    if (!this._enabled) {
      return this._strategy.deserialize(data);
    }

    const cacheKey = this._generateCacheKey(data);
    
    if (this._cache.has(cacheKey)) {
      return this._strategy.deserialize(this._cache.get(cacheKey)!);
    }

    const result = this._strategy.deserialize(data);
    
    return result;
  }

  getContentType(): ContentType {
    return this._strategy.getContentType();
  }

  getFormatName(): string {
    return this._strategy.getFormatName();
  }

  canSerialize(data: unknown): boolean {
    return this._strategy.canSerialize(data);
  }

  canDeserialize(data: string): boolean {
    return this._strategy.canDeserialize(data);
  }

  /**
   * Enables or disables caching
   * 
   * @param enabled - Enable flag
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  /**
   * Checks if caching is enabled
   * 
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Clears the cache
   */
  clearCache(): void {
    this._cache.clear();
  }

  /**
   * Gets the underlying strategy
   * 
   * @returns Wrapped strategy
   */
  getStrategy(): ISerializationStrategy {
    return this._strategy;
  }

  /**
   * Gets the cache provider
   * 
   * @returns Cache provider
   */
  getCache(): ICacheProvider {
    return this._cache;
  }

  /**
   * Generates a cache key for data
   * 
   * @param data - Data to generate key for
   * @returns Cache key
   */
  private _generateCacheKey(data: unknown): string {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    return `${this._strategy.getFormatName()}:${this._hashCode(dataStr)}`;
  }

  /**
   * Simple hash function for cache keys
   * 
   * @param str - String to hash
   * @returns Hash value
   */
  private _hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
