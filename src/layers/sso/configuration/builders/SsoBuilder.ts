import { SsoConfig } from '../../types/sso-types';
import { DEFAULT_SSO_CONFIG } from '../defaults/SsoDefaults';

export class SsoConfigBuilder {
  private _config: SsoConfig;

  constructor() {
    this._config = { ...DEFAULT_SSO_CONFIG };
  }

  withEnabled(enabled: boolean): SsoConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): SsoConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): SsoConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): SsoConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): SsoConfig {
    return { ...this._config };
  }
}
