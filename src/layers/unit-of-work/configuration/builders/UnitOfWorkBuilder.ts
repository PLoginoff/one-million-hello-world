import { UnitOfWorkConfig } from '../../types/unit-of-work-types';
import { DEFAULT_UNITOFWORK_CONFIG } from '../defaults/UnitOfWorkDefaults';

export class UnitOfWorkConfigBuilder {
  private _config: UnitOfWorkConfig;

  constructor() {
    this._config = { ...DEFAULT_UNITOFWORK_CONFIG };
  }

  withEnabled(enabled: boolean): UnitOfWorkConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): UnitOfWorkConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): UnitOfWorkConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): UnitOfWorkConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): UnitOfWorkConfig {
    return { ...this._config };
  }
}
