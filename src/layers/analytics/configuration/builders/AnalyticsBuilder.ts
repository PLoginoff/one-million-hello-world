import { AnalyticsConfig } from '../../types/analytics-types';
import { DEFAULT_ANALYTICS_CONFIG } from '../defaults/AnalyticsDefaults';

export class AnalyticsConfigBuilder {
  private _config: AnalyticsConfig;

  constructor() {
    this._config = { ...DEFAULT_ANALYTICS_CONFIG };
  }

  withEnabled(enabled: boolean): AnalyticsConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): AnalyticsConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): AnalyticsConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): AnalyticsConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): AnalyticsConfig {
    return { ...this._config };
  }
}
