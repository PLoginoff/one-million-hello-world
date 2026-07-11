import { EtlPipelineConfig } from '../../types/etl-pipeline-types';
import { DEFAULT_ETLPIPELINE_CONFIG } from '../defaults/EtlPipelineDefaults';

export class EtlPipelineConfigBuilder {
  private _config: EtlPipelineConfig;

  constructor() {
    this._config = { ...DEFAULT_ETLPIPELINE_CONFIG };
  }

  withEnabled(enabled: boolean): EtlPipelineConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): EtlPipelineConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): EtlPipelineConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): EtlPipelineConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): EtlPipelineConfig {
    return { ...this._config };
  }
}
