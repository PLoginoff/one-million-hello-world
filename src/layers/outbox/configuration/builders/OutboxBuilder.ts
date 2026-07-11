import { OutboxConfig } from '../../types/outbox-types';
import { DEFAULT_OUTBOX_CONFIG } from '../defaults/OutboxDefaults';

export class OutboxConfigBuilder {
  private _config: OutboxConfig;

  constructor() {
    this._config = { ...DEFAULT_OUTBOX_CONFIG };
  }

  withEnabled(enabled: boolean): OutboxConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): OutboxConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): OutboxConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): OutboxConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): OutboxConfig {
    return { ...this._config };
  }
}
