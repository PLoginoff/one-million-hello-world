import { PropertyTestingConfig } from '../../types/property-testing-types';
import { DEFAULT_PROPERTYTESTING_CONFIG } from '../defaults/PropertyTestingDefaults';

export class PropertyTestingConfigBuilder {
  private _config: PropertyTestingConfig;

  constructor() {
    this._config = { ...DEFAULT_PROPERTYTESTING_CONFIG };
  }

  withEnabled(enabled: boolean): PropertyTestingConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): PropertyTestingConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): PropertyTestingConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): PropertyTestingConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): PropertyTestingConfig {
    return { ...this._config };
  }
}
