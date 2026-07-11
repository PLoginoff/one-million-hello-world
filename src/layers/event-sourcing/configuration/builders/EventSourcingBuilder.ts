import { EventSourcingConfig } from '../../types/event-sourcing-types';
import { DEFAULT_EVENTSOURCING_CONFIG } from '../defaults/EventSourcingDefaults';

export class EventSourcingConfigBuilder {
  private _config: EventSourcingConfig;

  constructor() {
    this._config = { ...DEFAULT_EVENTSOURCING_CONFIG };
  }

  withEnabled(enabled: boolean): EventSourcingConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): EventSourcingConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): EventSourcingConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): EventSourcingConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): EventSourcingConfig {
    return { ...this._config };
  }
}
