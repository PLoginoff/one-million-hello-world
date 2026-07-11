import { QueryObjectConfig } from '../../types/query-object-types';
import { DEFAULT_QUERYOBJECT_CONFIG } from '../defaults/QueryObjectDefaults';

export class QueryObjectConfigBuilder {
  private _config: QueryObjectConfig;

  constructor() {
    this._config = { ...DEFAULT_QUERYOBJECT_CONFIG };
  }

  withEnabled(enabled: boolean): QueryObjectConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): QueryObjectConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): QueryObjectConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): QueryObjectConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): QueryObjectConfig {
    return { ...this._config };
  }
}
