import { ThrottlingConfig } from '../../types/throttling-types';
import { DEFAULT_THROTTLING_CONFIG } from '../defaults/ThrottlingDefaults';

export class ThrottlingConfigBuilder {
  private _config: ThrottlingConfig;

  constructor() {
    this._config = { ...DEFAULT_THROTTLING_CONFIG };
  }

  withEnabled(enabled: boolean): ThrottlingConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): ThrottlingConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): ThrottlingConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): ThrottlingConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): ThrottlingConfig {
    return { ...this._config };
  }
}
