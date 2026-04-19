/**
 * Cache Manager
 * 
 * Central manager for cache providers with namespacing.
 */

import { ICacheProvider, CacheEntry } from './ICacheProvider';
import { InMemoryCacheProvider } from './InMemoryCacheProvider';
import { LRUCacheProvider } from './LRUCacheProvider';

export type CacheProviderType = 'memory' | 'lru';

export class CacheManager {
  private _providers: Map<string, ICacheProvider>;
  private _defaultProviderType: CacheProviderType;

  constructor(defaultProviderType: CacheProviderType = 'memory') {
    this._providers = new Map();
    this._defaultProviderType = defaultProviderType;
  }

  /**
   * Registers a cache provider
   */
  register(name: string, provider: ICacheProvider): void {
    this._providers.set(name, provider);
  }

  /**
   * Unregisters a cache provider
   */
  unregister(name: string): void {
    this._providers.delete(name);
  }

  /**
   * Gets a cache provider by name
   */
  getProvider(name: string): ICacheProvider | undefined {
    return this._providers.get(name);
  }

  /**
   * Gets or creates a cache provider
   */
  getOrCreateProvider(name: string, type?: CacheProviderType): ICacheProvider {
    let provider = this._providers.get(name);

    if (!provider) {
      const providerType = type ?? this._defaultProviderType;
      provider = providerType === 'lru'
        ? new LRUCacheProvider()
        : new InMemoryCacheProvider();
      this._providers.set(name, provider);
    }

    return provider;
  }

  /**
   * Gets a value from a specific namespace
   */
  get<T>(namespace: string, key: string): T | undefined {
    const provider = this.getProvider(namespace);
    return provider ? provider.get(key) : undefined;
  }

  /**
   * Sets a value in a specific namespace
   */
  set<T>(namespace: string, key: string, value: T, ttl?: number): void {
    const provider = this.getOrCreateProvider(namespace);
    provider.set(key, value, ttl);
  }

  /**
   * Checks if a key exists in a namespace
   */
  has(namespace: string, key: string): boolean {
    const provider = this.getProvider(namespace);
    return provider ? provider.has(key) : false;
  }

  /**
   * Deletes a key from a namespace
   */
  delete(namespace: string, key: string): boolean {
    const provider = this.getProvider(namespace);
    return provider ? provider.delete(key) : false;
  }

  /**
   * Clears a specific namespace
   */
  clearNamespace(namespace: string): void {
    const provider = this.getProvider(namespace);
    if (provider) {
      provider.clear();
    }
  }

  /**
   * Clears all namespaces
   */
  clearAll(): void {
    for (const provider of this._providers.values()) {
      provider.clear();
    }
  }

  /**
   * Gets all provider names
   */
  getNamespaces(): string[] {
    return Array.from(this._providers.keys());
  }

  /**
   * Cleans up expired entries in all providers
   */
  cleanupAll(): number {
    let total = 0;
    for (const provider of this._providers.values()) {
      total += provider.cleanup();
    }
    return total;
  }

  /**
   * Gets statistics for all providers
   */
  getAllStats(): Record<string, unknown> {
    const stats: Record<string, unknown> = {};

    for (const [name, provider] of this._providers.entries()) {
      stats[name] = {
        size: provider.size(),
        keys: provider.keys(),
      };
    }

    return stats;
  }
}
