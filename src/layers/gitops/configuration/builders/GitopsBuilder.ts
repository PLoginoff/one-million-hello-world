import { GitopsConfig } from '../../types/gitops-types';
import { DEFAULT_GITOPS_CONFIG } from '../defaults/GitopsDefaults';

export class GitopsConfigBuilder {
  private _config: GitopsConfig;

  constructor() {
    this._config = { ...DEFAULT_GITOPS_CONFIG };
  }

  withEnabled(enabled: boolean): GitopsConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): GitopsConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): GitopsConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): GitopsConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): GitopsConfig {
    return { ...this._config };
  }
}
