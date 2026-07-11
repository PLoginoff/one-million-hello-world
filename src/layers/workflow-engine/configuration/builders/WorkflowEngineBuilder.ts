import { WorkflowEngineConfig } from '../../types/workflow-engine-types';
import { DEFAULT_WORKFLOWENGINE_CONFIG } from '../defaults/WorkflowEngineDefaults';

export class WorkflowEngineConfigBuilder {
  private _config: WorkflowEngineConfig;

  constructor() {
    this._config = { ...DEFAULT_WORKFLOWENGINE_CONFIG };
  }

  withEnabled(enabled: boolean): WorkflowEngineConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): WorkflowEngineConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): WorkflowEngineConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): WorkflowEngineConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): WorkflowEngineConfig {
    return { ...this._config };
  }
}
