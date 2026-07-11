import { AuditConfig } from '../../types/audit-types';
import { DEFAULT_AUDIT_CONFIG } from '../defaults/AuditDefaults';

export class AuditConfigBuilder {
  private _config: AuditConfig;

  constructor() {
    this._config = { ...DEFAULT_AUDIT_CONFIG };
  }

  withEnabled(enabled: boolean): AuditConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): AuditConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): AuditConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): AuditConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): AuditConfig {
    return { ...this._config };
  }
}
