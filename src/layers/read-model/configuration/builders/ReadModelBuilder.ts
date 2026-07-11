import { ReadModelConfig } from '../../types/read-model-types';
import { DEFAULT_READMODEL_CONFIG } from '../defaults/ReadModelDefaults';

export class ReadModelConfigBuilder {
  private _config: ReadModelConfig;

  constructor() {
    this._config = { ...DEFAULT_READMODEL_CONFIG };
  }

  withEnabled(enabled: boolean): ReadModelConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): ReadModelConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): ReadModelConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): ReadModelConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): ReadModelConfig {
    return { ...this._config };
  }
}
