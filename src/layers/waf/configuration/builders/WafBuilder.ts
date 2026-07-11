import { WafConfig } from '../../types/waf-types';
import { DEFAULT_WAF_CONFIG } from '../defaults/WafDefaults';

export class WafConfigBuilder {
  private _config: WafConfig;

  constructor() {
    this._config = { ...DEFAULT_WAF_CONFIG };
  }

  withEnabled(enabled: boolean): WafConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): WafConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): WafConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): WafConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): WafConfig {
    return { ...this._config };
  }
}
