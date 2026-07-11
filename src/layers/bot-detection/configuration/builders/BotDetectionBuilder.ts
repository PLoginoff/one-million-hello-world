import { BotDetectionConfig } from '../../types/bot-detection-types';
import { DEFAULT_BOTDETECTION_CONFIG } from '../defaults/BotDetectionDefaults';

export class BotDetectionConfigBuilder {
  private _config: BotDetectionConfig;

  constructor() {
    this._config = { ...DEFAULT_BOTDETECTION_CONFIG };
  }

  withEnabled(enabled: boolean): BotDetectionConfigBuilder {
    this._config = { ...this._config, enabled };
    return this;
  }

  withTimeout(timeout: number): BotDetectionConfigBuilder {
    this._config = { ...this._config, timeout };
    return this;
  }

  withRetries(retries: number): BotDetectionConfigBuilder {
    this._config = { ...this._config, retries };
    return this;
  }

  withLogLevel(logLevel: 'debug' | 'info' | 'warn' | 'error'): BotDetectionConfigBuilder {
    this._config = { ...this._config, logLevel };
    return this;
  }

  build(): BotDetectionConfig {
    return { ...this._config };
  }
}
