import { CqrsConfig } from '../../types/cqrs-types';
import { DEFAULT_CQRS_CONFIG } from '../defaults/CqrsDefaults';

export class CqrsConfigBuilder {
  private _config: CqrsConfig;

  constructor() {
    this._config = { ...DEFAULT_CQRS_CONFIG };
  }

  withEnabled(enabled: boolean): CqrsConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): CqrsConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): CqrsConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): CqrsConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): CqrsConfig {
    return { ...this._config };
  }
}
