import { ChaosEngineeringConfig } from '../../types/chaos-engineering-types';
import { DEFAULT_CHAOSENGINEERING_CONFIG } from '../defaults/ChaosEngineeringDefaults';

export class ChaosEngineeringConfigBuilder {
  private _config: ChaosEngineeringConfig;

  constructor() {
    this._config = { ...DEFAULT_CHAOSENGINEERING_CONFIG };
  }

  withEnabled(enabled: boolean): ChaosEngineeringConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): ChaosEngineeringConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): ChaosEngineeringConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): ChaosEngineeringConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): ChaosEngineeringConfig {
    return { ...this._config };
  }
}
