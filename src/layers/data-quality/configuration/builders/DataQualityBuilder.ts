import { DataQualityConfig } from '../../types/data-quality-types';
import { DEFAULT_DATAQUALITY_CONFIG } from '../defaults/DataQualityDefaults';

export class DataQualityConfigBuilder {
  private _config: DataQualityConfig;

  constructor() {
    this._config = { ...DEFAULT_DATAQUALITY_CONFIG };
  }

  withEnabled(enabled: boolean): DataQualityConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): DataQualityConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): DataQualityConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): DataQualityConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): DataQualityConfig {
    return { ...this._config };
  }
}
