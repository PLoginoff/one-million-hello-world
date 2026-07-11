import { Oauth2Config } from '../../types/oauth2-types';
import { DEFAULT_OAUTH2_CONFIG } from '../defaults/Oauth2Defaults';

export class Oauth2ConfigBuilder {
  private _config: Oauth2Config;

  constructor() {
    this._config = { ...DEFAULT_OAUTH2_CONFIG };
  }

  withEnabled(enabled: boolean): Oauth2ConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): Oauth2ConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): Oauth2ConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): Oauth2ConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): Oauth2Config {
    return { ...this._config };
  }
}
