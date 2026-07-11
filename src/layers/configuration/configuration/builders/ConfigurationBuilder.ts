import { ConfigurationConfig } from '../../types/configuration-types';
import { DEFAULT_CONFIGURATION_CONFIG } from '../defaults/ConfigurationDefaults';

export class ConfigurationConfigBuilder {
  private _config: ConfigurationConfig;

  constructor() {
    this._config = { ...DEFAULT_CONFIGURATION_CONFIG };
  }

  withEnabled(enabled: boolean): ConfigurationConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): ConfigurationConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): ConfigurationConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): ConfigurationConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): ConfigurationConfig {
    return { ...this._config };
  }
}
