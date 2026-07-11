import { InboxConfig } from '../../types/inbox-types';
import { DEFAULT_INBOX_CONFIG } from '../defaults/InboxDefaults';

export class InboxConfigBuilder {
  private _config: InboxConfig;

  constructor() {
    this._config = { ...DEFAULT_INBOX_CONFIG };
  }

  withEnabled(enabled: boolean): InboxConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): InboxConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): InboxConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): InboxConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): InboxConfig {
    return { ...this._config };
  }
}
