import { JwtValidationConfig } from '../../types/jwt-validation-types';
import { DEFAULT_JWTVALIDATION_CONFIG } from '../defaults/JwtValidationDefaults';

export class JwtValidationConfigBuilder {
  private _config: JwtValidationConfig;

  constructor() {
    this._config = { ...DEFAULT_JWTVALIDATION_CONFIG };
  }

  withEnabled(enabled: boolean): JwtValidationConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): JwtValidationConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): JwtValidationConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): JwtValidationConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): JwtValidationConfig {
    return { ...this._config };
  }
}
