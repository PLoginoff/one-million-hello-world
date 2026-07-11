import { ServiceMeshConfig } from '../../types/service-mesh-types';
import { DEFAULT_SERVICEMESH_CONFIG } from '../defaults/ServiceMeshDefaults';

export class ServiceMeshConfigBuilder {
  private _config: ServiceMeshConfig;

  constructor() {
    this._config = { ...DEFAULT_SERVICEMESH_CONFIG };
  }

  withEnabled(enabled: boolean): ServiceMeshConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): ServiceMeshConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): ServiceMeshConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): ServiceMeshConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): ServiceMeshConfig {
    return { ...this._config };
  }
}
