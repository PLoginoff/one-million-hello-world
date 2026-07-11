import { BlueGreenDeployConfig } from '../../types/blue-green-deploy-types';
import { DEFAULT_BLUEGREENDEPLOY_CONFIG } from '../defaults/BlueGreenDeployDefaults';

export class BlueGreenDeployConfigBuilder {
  private _config: BlueGreenDeployConfig;

  constructor() {
    this._config = { ...DEFAULT_BLUEGREENDEPLOY_CONFIG };
  }

  withEnabled(enabled: boolean): BlueGreenDeployConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): BlueGreenDeployConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): BlueGreenDeployConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): BlueGreenDeployConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): BlueGreenDeployConfig {
    return { ...this._config };
  }
}
