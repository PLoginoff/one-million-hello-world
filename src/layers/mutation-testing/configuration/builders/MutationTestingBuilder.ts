import { MutationTestingConfig } from '../../types/mutation-testing-types';
import { DEFAULT_MUTATIONTESTING_CONFIG } from '../defaults/MutationTestingDefaults';

export class MutationTestingConfigBuilder {
  private _config: MutationTestingConfig;

  constructor() {
    this._config = { ...DEFAULT_MUTATIONTESTING_CONFIG };
  }

  withEnabled(enabled: boolean): MutationTestingConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): MutationTestingConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): MutationTestingConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): MutationTestingConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): MutationTestingConfig {
    return { ...this._config };
  }
}
