import { BpmnConfig } from '../../types/bpmn-types';
import { DEFAULT_BPMN_CONFIG } from '../defaults/BpmnDefaults';

export class BpmnConfigBuilder {
  private _config: BpmnConfig;

  constructor() {
    this._config = { ...DEFAULT_BPMN_CONFIG };
  }

  withEnabled(enabled: boolean): BpmnConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): BpmnConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): BpmnConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): BpmnConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): BpmnConfig {
    return { ...this._config };
  }
}
