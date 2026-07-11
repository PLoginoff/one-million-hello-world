import { FeatureFlagsConfig } from '../../types/feature-flags-types';
import { DEFAULT_FEATUREFLAGS_CONFIG } from '../defaults/FeatureFlagsDefaults';

export class FeatureFlagsConfigBuilder {
  private _config: FeatureFlagsConfig;

  constructor() {
    this._config = { ...DEFAULT_FEATUREFLAGS_CONFIG };
  }

  withEnabled(enabled: boolean): FeatureFlagsConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): FeatureFlagsConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): FeatureFlagsConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): FeatureFlagsConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): FeatureFlagsConfig {
    return { ...this._config };
  }
}
