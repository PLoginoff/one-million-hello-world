import { PerformanceTestingConfig } from '../../types/performance-testing-types';
import { DEFAULT_PERFORMANCETESTING_CONFIG } from '../defaults/PerformanceTestingDefaults';

export class PerformanceTestingConfigBuilder {
  private _config: PerformanceTestingConfig;

  constructor() {
    this._config = { ...DEFAULT_PERFORMANCETESTING_CONFIG };
  }

  withEnabled(enabled: boolean): PerformanceTestingConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): PerformanceTestingConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): PerformanceTestingConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): PerformanceTestingConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): PerformanceTestingConfig {
    return { ...this._config };
  }
}
