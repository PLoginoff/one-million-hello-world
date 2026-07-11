import { DeadLetterConfig } from '../../types/dead-letter-types';
import { DEFAULT_DEADLETTER_CONFIG } from '../defaults/DeadLetterDefaults';

export class DeadLetterConfigBuilder {
  private _config: DeadLetterConfig;

  constructor() {
    this._config = { ...DEFAULT_DEADLETTER_CONFIG };
  }

  withEnabled(enabled: boolean): DeadLetterConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): DeadLetterConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): DeadLetterConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): DeadLetterConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): DeadLetterConfig {
    return { ...this._config };
  }
}
