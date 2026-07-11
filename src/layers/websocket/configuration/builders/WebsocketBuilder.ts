import { WebsocketConfig } from '../../types/websocket-types';
import { DEFAULT_WEBSOCKET_CONFIG } from '../defaults/WebsocketDefaults';

export class WebsocketConfigBuilder {
  private _config: WebsocketConfig;

  constructor() {
    this._config = { ...DEFAULT_WEBSOCKET_CONFIG };
  }

  withEnabled(enabled: boolean): WebsocketConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): WebsocketConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): WebsocketConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): WebsocketConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): WebsocketConfig {
    return { ...this._config };
  }
}
