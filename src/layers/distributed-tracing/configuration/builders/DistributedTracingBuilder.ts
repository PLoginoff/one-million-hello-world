import { DistributedTracingConfig } from '../../types/distributed-tracing-types';
import { DEFAULT_DISTRIBUTEDTRACING_CONFIG } from '../defaults/DistributedTracingDefaults';

export class DistributedTracingConfigBuilder {
  private _config: DistributedTracingConfig;

  constructor() {
    this._config = { ...DEFAULT_DISTRIBUTEDTRACING_CONFIG };
  }

  withEnabled(enabled: boolean): DistributedTracingConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): DistributedTracingConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): DistributedTracingConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): DistributedTracingConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): DistributedTracingConfig {
    return { ...this._config };
  }
}
