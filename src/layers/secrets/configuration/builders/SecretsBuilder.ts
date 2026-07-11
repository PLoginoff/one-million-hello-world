import { SecretsConfig } from '../../types/secrets-types';
import { DEFAULT_SECRETS_CONFIG } from '../defaults/SecretsDefaults';

export class SecretsConfigBuilder {
  private _config: SecretsConfig;

  constructor() {
    this._config = { ...DEFAULT_SECRETS_CONFIG };
  }

  withEnabled(enabled: boolean): SecretsConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): SecretsConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): SecretsConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): SecretsConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): SecretsConfig {
    return { ...this._config };
  }
}
