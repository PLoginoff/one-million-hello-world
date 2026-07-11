import { IdentityConfig } from '../../types/identity-types';
import { DEFAULT_IDENTITY_CONFIG } from '../defaults/IdentityDefaults';

export class IdentityConfigBuilder {
  private _config: IdentityConfig;

  constructor() {
    this._config = { ...DEFAULT_IDENTITY_CONFIG };
  }

  withEnabled(enabled: boolean): IdentityConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): IdentityConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): IdentityConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): IdentityConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): IdentityConfig {
    return { ...this._config };
  }
}
