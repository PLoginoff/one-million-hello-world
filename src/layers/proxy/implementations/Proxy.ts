/**
 * Proxy Implementation
 * 
 * Concrete implementation of IProxy.
 * Handles access control, lazy loading, and caching proxy.
 */

import { IProxy } from '../interfaces/IProxy';
import { ProxyResult, ProxyConfig } from '../types/proxy-types';

export class Proxy implements IProxy {
  private _config: ProxyConfig;
  private _cache: Map<string, unknown>;

  constructor() {
    this._config = {
      enableAccessControl: false,
      enableLazyLoading: false,
      enableCaching: false,
    };
    this._cache = new Map();
  }

  async execute<T>(operation: () => Promise<T>, key: string): Promise<ProxyResult<T>> {
    if (this._config.enableCaching) {
      const cached = this._cache.get(key) as T;
      if (cached !== undefined) {
        return {
          success: true,
          data: cached,
          fromCache: true,
        };
      }
    }

    try {
      const result = await operation();

      if (this._config.enableCaching) {
        this._cache.set(key, result);
      }

      return {
        success: true,
        data: result,
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        fromCache: false,
        error: error instanceof Error ? error.message : 'Proxy execution failed',
      };
    }
  }

  clearCache(key?: string): void {
    if (key) {
      this._cache.delete(key);
    } else {
      this._cache.clear();
    }
  }

  setConfig(config: ProxyConfig): void {
    this._config = { ...this._config, ...config };
  }

  getConfig(): ProxyConfig {
    return { ...this._config };
  }
}
