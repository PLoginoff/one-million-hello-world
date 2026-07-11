import { ServiceDiscoveryConfig } from '../../types/service-discovery-types';
import { DEFAULT_SERVICEDISCOVERY_CONFIG } from '../defaults/ServiceDiscoveryDefaults';

export class ServiceDiscoveryConfigBuilder {
  private _config: ServiceDiscoveryConfig;

  constructor() {
    this._config = { ...DEFAULT_SERVICEDISCOVERY_CONFIG };
  }

  withEnabled(enabled: boolean): ServiceDiscoveryConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): ServiceDiscoveryConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): ServiceDiscoveryConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): ServiceDiscoveryConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): ServiceDiscoveryConfig {
    return { ...this._config };
  }
}
