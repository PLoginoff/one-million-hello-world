import { PolicyEngineConfig } from '../../types/policy-engine-types';
import { DEFAULT_POLICYENGINE_CONFIG } from '../defaults/PolicyEngineDefaults';

export class PolicyEngineConfigBuilder {
  private _config: PolicyEngineConfig;

  constructor() {
    this._config = { ...DEFAULT_POLICYENGINE_CONFIG };
  }

  withEnabled(enabled: boolean): PolicyEngineConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): PolicyEngineConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): PolicyEngineConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): PolicyEngineConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): PolicyEngineConfig {
    return { ...this._config };
  }
}
