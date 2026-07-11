import { SiemConfig } from '../../types/siem-types';
import { DEFAULT_SIEM_CONFIG } from '../defaults/SiemDefaults';

export class SiemConfigBuilder {
  private _config: SiemConfig;

  constructor() {
    this._config = { ...DEFAULT_SIEM_CONFIG };
  }

  withEnabled(enabled: boolean): SiemConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): SiemConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): SiemConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): SiemConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): SiemConfig {
    return { ...this._config };
  }
}
