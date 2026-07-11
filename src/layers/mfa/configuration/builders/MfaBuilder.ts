import { MfaConfig } from '../../types/mfa-types';
import { DEFAULT_MFA_CONFIG } from '../defaults/MfaDefaults';

export class MfaConfigBuilder {
  private _config: MfaConfig;

  constructor() {
    this._config = { ...DEFAULT_MFA_CONFIG };
  }

  withEnabled(enabled: boolean): MfaConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): MfaConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): MfaConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): MfaConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): MfaConfig {
    return { ...this._config };
  }
}
