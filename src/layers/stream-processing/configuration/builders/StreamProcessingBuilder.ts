import { StreamProcessingConfig } from '../../types/stream-processing-types';
import { DEFAULT_STREAMPROCESSING_CONFIG } from '../defaults/StreamProcessingDefaults';

export class StreamProcessingConfigBuilder {
  private _config: StreamProcessingConfig;

  constructor() {
    this._config = { ...DEFAULT_STREAMPROCESSING_CONFIG };
  }

  withEnabled(enabled: boolean): StreamProcessingConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): StreamProcessingConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): StreamProcessingConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): StreamProcessingConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): StreamProcessingConfig {
    return { ...this._config };
  }
}
