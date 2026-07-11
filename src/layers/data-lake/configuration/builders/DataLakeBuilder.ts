import { DataLakeConfig } from '../../types/data-lake-types';
import { DEFAULT_DATALAKE_CONFIG } from '../defaults/DataLakeDefaults';

export class DataLakeConfigBuilder {
  private _config: DataLakeConfig;

  constructor() {
    this._config = { ...DEFAULT_DATALAKE_CONFIG };
  }

  withEnabled(enabled: boolean): DataLakeConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): DataLakeConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): DataLakeConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): DataLakeConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): DataLakeConfig {
    return { ...this._config };
  }
}
