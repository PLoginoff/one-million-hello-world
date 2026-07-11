import { ContractTestingConfig } from '../../types/contract-testing-types';
import { DEFAULT_CONTRACTTESTING_CONFIG } from '../defaults/ContractTestingDefaults';

export class ContractTestingConfigBuilder {
  private _config: ContractTestingConfig;

  constructor() {
    this._config = { ...DEFAULT_CONTRACTTESTING_CONFIG };
  }

  withEnabled(enabled: boolean): ContractTestingConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): ContractTestingConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): ContractTestingConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): ContractTestingConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): ContractTestingConfig {
    return { ...this._config };
  }
}
