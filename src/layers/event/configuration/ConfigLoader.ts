/**
 * ConfigLoader - Configuration
 * 
 * Loads configuration from various sources.
 * Supports environment variables, files, and programmatic configuration.
 */

import { EventBusConfig, EventBusConfigOptions } from './EventBusConfig';
import { ConfigValidator, ValidationResult } from './ConfigValidator';

export type ConfigSource = 'env' | 'file' | 'programmatic' | 'default';

export interface LoadedConfig {
  config: EventBusConfig;
  source: ConfigSource;
  validationResult: ValidationResult;
}

export class ConfigLoader {
  private _validator: ConfigValidator;
  private _envPrefix: string;

  constructor(envPrefix: string = 'EVENT_BUS_') {
    this._validator = new ConfigValidator();
    this._envPrefix = envPrefix;
  }

  load(): LoadedConfig {
    const options = this._loadFromSources();
    const config = new EventBusConfig(options);
    const validationResult = this._validator.validate(config);

    return {
      config,
      source: 'env',
      validationResult,
    };
  }

  loadFromEnv(): LoadedConfig {
    const options = this._loadFromEnv();
    const config = new EventBusConfig(options);
    const validationResult = this._validator.validate(config);

    return {
      config,
      source: 'env',
      validationResult,
    };
  }

  loadFromFile(filePath: string): LoadedConfig {
    const options = this._loadFromFile(filePath);
    const config = new EventBusConfig(options);
    const validationResult = this._validator.validate(config);

    return {
      config,
      source: 'file',
      validationResult,
    };
  }

  loadFromProgrammatic(options: EventBusConfigOptions): LoadedConfig {
    const config = new EventBusConfig(options);
    const validationResult = this._validator.validate(config);

    return {
      config,
      source: 'programmatic',
      validationResult,
    };
  }

  loadDefault(): LoadedConfig {
    const config = EventBusConfig.default();
    const validationResult = this._validator.validate(config);

    return {
      config,
      source: 'default',
      validationResult,
    };
  }

  setEnvPrefix(prefix: string): void {
    this._envPrefix = prefix;
  }

  getEnvPrefix(): string {
    return this._envPrefix;
  }

  private _loadFromSources(): EventBusConfigOptions {
    const envOptions = this._loadFromEnv();
    return envOptions;
  }

  private _loadFromEnv(): EventBusConfigOptions {
    const options: EventBusConfigOptions = {};

    const envMap: Record<string, keyof EventBusConfigOptions> = {
      [`${this._envPrefix}ENABLE_ASYNC`]: 'enableAsync',
      [`${this._envPrefix}ENABLE_PERSISTENCE`]: 'enablePersistence',
      [`${this._envPrefix}MAX_QUEUE_SIZE`]: 'maxQueueSize',
      [`${this._envPrefix}MAX_SUBSCRIPTIONS`]: 'maxSubscriptions',
      [`${this._envPrefix}TIMEOUT`]: 'timeout',
      [`${this._envPrefix}RETRY_ON_FAILURE`]: 'retryOnFailure',
      [`${this._envPrefix}MAX_RETRIES`]: 'maxRetries',
      [`${this._envPrefix}ENABLE_METRICS`]: 'enableMetrics',
      [`${this._envPrefix}ENABLE_LOGGING`]: 'enableLogging',
      [`${this._envPrefix}LOG_LEVEL`]: 'logLevel',
      [`${this._envPrefix}SERIALIZATION_FORMAT`]: 'serializationFormat',
    };

    for (const [envKey, optionKey] of Object.entries(envMap)) {
      const value = process.env[envKey];
      if (value !== undefined) {
        (options as any)[optionKey] = this._parseEnvValue(value);
      }
    }

    return options;
  }

  private _loadFromFile(filePath: string): EventBusConfigOptions {
    return {};
  }

  private _parseEnvValue(value: string): boolean | number | string {
    if (value === 'true') return true;
    if (value === 'false') return false;
    const num = Number(value);
    if (!isNaN(num)) return num;
    return value;
  }
}
