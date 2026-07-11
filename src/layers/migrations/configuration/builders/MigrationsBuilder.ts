import { MigrationsConfig } from '../../types/migrations-types';
import { DEFAULT_MIGRATIONS_CONFIG } from '../defaults/MigrationsDefaults';

export class MigrationsConfigBuilder {
  private _config: MigrationsConfig;

  constructor() {
    this._config = { ...DEFAULT_MIGRATIONS_CONFIG };
  }

  withEnabled(enabled: boolean): MigrationsConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): MigrationsConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): MigrationsConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): MigrationsConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): MigrationsConfig {
    return { ...this._config };
  }
}
