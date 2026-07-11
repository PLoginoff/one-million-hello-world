import { SpecificationConfig } from '../../types/specification-types';
import { DEFAULT_SPECIFICATION_CONFIG } from '../defaults/SpecificationDefaults';

export class SpecificationConfigBuilder {
  private _config: SpecificationConfig;

  constructor() {
    this._config = { ...DEFAULT_SPECIFICATION_CONFIG };
  }

  withEnabled(enabled: boolean): SpecificationConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): SpecificationConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): SpecificationConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): SpecificationConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): SpecificationConfig {
    return { ...this._config };
  }
}
