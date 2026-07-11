import { LoadBalancerConfig } from '../../types/load-balancer-types';
import { DEFAULT_LOADBALANCER_CONFIG } from '../defaults/LoadBalancerDefaults';

export class LoadBalancerConfigBuilder {
  private _config: LoadBalancerConfig;

  constructor() {
    this._config = { ...DEFAULT_LOADBALANCER_CONFIG };
  }

  withEnabled(enabled: boolean): LoadBalancerConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): LoadBalancerConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): LoadBalancerConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): LoadBalancerConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): LoadBalancerConfig {
    return { ...this._config };
  }
}
