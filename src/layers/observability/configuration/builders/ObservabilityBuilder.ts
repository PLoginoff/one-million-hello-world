import { ObservabilityConfig } from '../../types/observability-types';
import { DEFAULT_OBSERVABILITY_CONFIG } from '../defaults/ObservabilityDefaults';

export class ObservabilityConfigBuilder {
  private _config: ObservabilityConfig;

  constructor() {
    this._config = { ...DEFAULT_OBSERVABILITY_CONFIG };
  }

  withEnabled(enabled: boolean): ObservabilityConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): ObservabilityConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): ObservabilityConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): ObservabilityConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): ObservabilityConfig {
    return { ...this._config };
  }
}
