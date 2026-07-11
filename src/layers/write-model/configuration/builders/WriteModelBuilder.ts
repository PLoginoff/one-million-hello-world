import { WriteModelConfig } from '../../types/write-model-types';
import { DEFAULT_WRITEMODEL_CONFIG } from '../defaults/WriteModelDefaults';

export class WriteModelConfigBuilder {
  private _config: WriteModelConfig;

  constructor() {
    this._config = { ...DEFAULT_WRITEMODEL_CONFIG };
  }

  withEnabled(enabled: boolean): WriteModelConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): WriteModelConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): WriteModelConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): WriteModelConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): WriteModelConfig {
    return { ...this._config };
  }
}
