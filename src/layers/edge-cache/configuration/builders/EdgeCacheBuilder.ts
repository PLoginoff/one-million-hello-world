import { EdgeCacheConfig } from '../../types/edge-cache-types';
import { DEFAULT_EDGECACHE_CONFIG } from '../defaults/EdgeCacheDefaults';

export class EdgeCacheConfigBuilder {
  private _config: EdgeCacheConfig;

  constructor() {
    this._config = { ...DEFAULT_EDGECACHE_CONFIG };
  }

  withEnabled(enabled: boolean): EdgeCacheConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): EdgeCacheConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): EdgeCacheConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): EdgeCacheConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): EdgeCacheConfig {
    return { ...this._config };
  }
}
