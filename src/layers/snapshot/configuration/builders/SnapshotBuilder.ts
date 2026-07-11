import { SnapshotConfig } from '../../types/snapshot-types';
import { DEFAULT_SNAPSHOT_CONFIG } from '../defaults/SnapshotDefaults';

export class SnapshotConfigBuilder {
  private _config: SnapshotConfig;

  constructor() {
    this._config = { ...DEFAULT_SNAPSHOT_CONFIG };
  }

  withEnabled(enabled: boolean): SnapshotConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): SnapshotConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): SnapshotConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): SnapshotConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): SnapshotConfig {
    return { ...this._config };
  }
}
