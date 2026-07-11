import { DataWarehouseConfig } from '../../types/data-warehouse-types';
import { DEFAULT_DATAWAREHOUSE_CONFIG } from '../defaults/DataWarehouseDefaults';

export class DataWarehouseConfigBuilder {
  private _config: DataWarehouseConfig;

  constructor() {
    this._config = { ...DEFAULT_DATAWAREHOUSE_CONFIG };
  }

  withEnabled(enabled: boolean): DataWarehouseConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): DataWarehouseConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): DataWarehouseConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): DataWarehouseConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): DataWarehouseConfig {
    return { ...this._config };
  }
}
