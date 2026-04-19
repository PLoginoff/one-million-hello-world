/**
 * Configuration Error
 * 
 * Error thrown when configuration is invalid.
 */

import { BaseSerializationError } from './BaseSerializationError';

export class ConfigError extends BaseSerializationError {
  constructor(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super('CONFIG_ERROR', message, context, cause);
  }

  /**
   * Creates error for missing configuration
   */
  static missingConfig(key: string): ConfigError {
    return new ConfigError(
      `Missing required configuration: ${key}`,
      { key }
    );
  }

  /**
   * Creates error for invalid configuration value
   */
  static invalidConfigValue(key: string, value: unknown, reason: string): ConfigError {
    return new ConfigError(
      `Invalid configuration value for ${key}: ${reason}`,
      { key, value, reason }
    );
  }

  /**
   * Creates error for configuration validation failure
   */
  static validationFailed(errors: string[]): ConfigError {
    return new ConfigError(
      'Configuration validation failed',
      { errors }
    );
  }

  /**
   * Creates error for configuration load failure
   */
  static loadFailed(source: string, cause?: Error): ConfigError {
    return new ConfigError(
      `Failed to load configuration from: ${source}`,
      { source },
      cause
    );
  }
}
