import { BackupConfig } from '../../types/backup-types';
import { DEFAULT_BACKUP_CONFIG } from '../defaults/BackupDefaults';

export class BackupConfigBuilder {
  private _config: BackupConfig;

  constructor() {
    this._config = { ...DEFAULT_BACKUP_CONFIG };
  }

  withEnabled(enabled: boolean): BackupConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): BackupConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): BackupConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): BackupConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): BackupConfig {
    return { ...this._config };
  }
}
