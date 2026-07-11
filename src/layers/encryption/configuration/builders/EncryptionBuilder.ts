import { EncryptionConfig } from '../../types/encryption-types';
import { DEFAULT_ENCRYPTION_CONFIG } from '../defaults/EncryptionDefaults';

export class EncryptionConfigBuilder {
  private _config: EncryptionConfig;

  constructor() {
    this._config = { ...DEFAULT_ENCRYPTION_CONFIG };
  }

  withEnabled(enabled: boolean): EncryptionConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): EncryptionConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): EncryptionConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): EncryptionConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): EncryptionConfig {
    return { ...this._config };
  }
}
