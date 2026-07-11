import { FraudDetectionConfig } from '../../types/fraud-detection-types';
import { DEFAULT_FRAUDDETECTION_CONFIG } from '../defaults/FraudDetectionDefaults';

export class FraudDetectionConfigBuilder {
  private _config: FraudDetectionConfig;

  constructor() {
    this._config = { ...DEFAULT_FRAUDDETECTION_CONFIG };
  }

  withEnabled(enabled: boolean): FraudDetectionConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): FraudDetectionConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): FraudDetectionConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): FraudDetectionConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): FraudDetectionConfig {
    return { ...this._config };
  }
}
