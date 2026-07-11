import { DdosProtectionConfig } from '../../types/ddos-protection-types';
import { DEFAULT_DDOSPROTECTION_CONFIG } from '../defaults/DdosProtectionDefaults';

export class DdosProtectionConfigBuilder {
  private _config: DdosProtectionConfig;

  constructor() {
    this._config = { ...DEFAULT_DDOSPROTECTION_CONFIG };
  }

  withEnabled(enabled: boolean): DdosProtectionConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): DdosProtectionConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): DdosProtectionConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): DdosProtectionConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): DdosProtectionConfig {
    return { ...this._config };
  }
}
