import { IdentityProviderConfig } from '../../types/identity-provider-types';
import { DEFAULT_IDENTITYPROVIDER_CONFIG } from '../defaults/IdentityProviderDefaults';

export class IdentityProviderConfigBuilder {
  private _config: IdentityProviderConfig;

  constructor() {
    this._config = { ...DEFAULT_IDENTITYPROVIDER_CONFIG };
  }

  withEnabled(enabled: boolean): IdentityProviderConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): IdentityProviderConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): IdentityProviderConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): IdentityProviderConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): IdentityProviderConfig {
    return { ...this._config };
  }
}
