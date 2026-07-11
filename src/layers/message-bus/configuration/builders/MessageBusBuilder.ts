import { MessageBusConfig } from '../../types/message-bus-types';
import { DEFAULT_MESSAGEBUS_CONFIG } from '../defaults/MessageBusDefaults';

export class MessageBusConfigBuilder {
  private _config: MessageBusConfig;

  constructor() {
    this._config = { ...DEFAULT_MESSAGEBUS_CONFIG };
  }

  withEnabled(enabled: boolean): MessageBusConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): MessageBusConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): MessageBusConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): MessageBusConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): MessageBusConfig {
    return { ...this._config };
  }
}
