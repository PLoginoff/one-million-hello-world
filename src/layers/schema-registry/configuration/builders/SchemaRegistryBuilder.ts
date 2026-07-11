import { SchemaRegistryConfig } from '../../types/schema-registry-types';
import { DEFAULT_SCHEMAREGISTRY_CONFIG } from '../defaults/SchemaRegistryDefaults';

export class SchemaRegistryConfigBuilder {
  private _config: SchemaRegistryConfig;

  constructor() {
    this._config = { ...DEFAULT_SCHEMAREGISTRY_CONFIG };
  }

  withEnabled(enabled: boolean): SchemaRegistryConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): SchemaRegistryConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): SchemaRegistryConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): SchemaRegistryConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): SchemaRegistryConfig {
    return { ...this._config };
  }
}
