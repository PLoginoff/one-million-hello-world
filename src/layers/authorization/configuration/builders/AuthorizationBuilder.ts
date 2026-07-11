import { AuthorizationConfig } from '../../types/authorization-types';
import { DEFAULT_AUTHORIZATION_CONFIG } from '../defaults/AuthorizationDefaults';

export class AuthorizationConfigBuilder {
  private _config: AuthorizationConfig;

  constructor() {
    this._config = { ...DEFAULT_AUTHORIZATION_CONFIG };
  }

  withEnabled(enabled: boolean): AuthorizationConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): AuthorizationConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): AuthorizationConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): AuthorizationConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): AuthorizationConfig {
    return { ...this._config };
  }
}
