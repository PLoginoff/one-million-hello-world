import { CanaryDeployConfig } from '../../types/canary-deploy-types';
import { DEFAULT_CANARYDEPLOY_CONFIG } from '../defaults/CanaryDeployDefaults';

export class CanaryDeployConfigBuilder {
  private _config: CanaryDeployConfig;

  constructor() {
    this._config = { ...DEFAULT_CANARYDEPLOY_CONFIG };
  }

  withEnabled(enabled: boolean): CanaryDeployConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): CanaryDeployConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): CanaryDeployConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): CanaryDeployConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): CanaryDeployConfig {
    return { ...this._config };
  }
}
