import { RulesEngineConfig } from '../../types/rules-engine-types';
import { DEFAULT_RULESENGINE_CONFIG } from '../defaults/RulesEngineDefaults';

export class RulesEngineConfigBuilder {
  private _config: RulesEngineConfig;

  constructor() {
    this._config = { ...DEFAULT_RULESENGINE_CONFIG };
  }

  withEnabled(enabled: boolean): RulesEngineConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): RulesEngineConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): RulesEngineConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): RulesEngineConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): RulesEngineConfig {
    return { ...this._config };
  }
}
