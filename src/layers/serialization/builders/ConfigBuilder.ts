/**
 * Configuration Builder
 * 
 * Fluent builder for creating SerializationConfig objects.
 */

import { SerializationConfig } from '../types/serialization-types';
import { SerializationFormat } from '../types/serialization-types';

export class ConfigBuilder {
  private _config: Partial<SerializationConfig>;

  constructor() {
    this._config = {
      defaultFormat: SerializationFormat.JSON,
      enableVersioning: false,
      currentVersion: '1.0',
      enableValidation: false,
      enablePlugins: true,
      enableHooks: true,
      strictMode: false,
    };
  }

  /**
   * Sets the default serialization format
   * 
   * @param format - Default format
   * @returns This builder for chaining
   */
  withDefaultFormat(format: SerializationFormat): ConfigBuilder {
    this._config.defaultFormat = format;
    return this;
  }

  /**
   * Enables or disables versioning
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withVersioning(enabled: boolean): ConfigBuilder {
    this._config.enableVersioning = enabled;
    return this;
  }

  /**
   * Sets the current version
   * 
   * @param version - Version string
   * @returns This builder for chaining
   */
  withCurrentVersion(version: string): ConfigBuilder {
    this._config.currentVersion = version;
    return this;
  }

  /**
   * Enables or disables validation
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withValidation(enabled: boolean): ConfigBuilder {
    this._config.enableValidation = enabled;
    return this;
  }

  /**
   * Enables or disables plugins
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withPlugins(enabled: boolean): ConfigBuilder {
    this._config.enablePlugins = enabled;
    return this;
  }

  /**
   * Enables or disables hooks
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withHooks(enabled: boolean): ConfigBuilder {
    this._config.enableHooks = enabled;
    return this;
  }

  /**
   * Enables or disables strict mode
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withStrictMode(enabled: boolean): ConfigBuilder {
    this._config.strictMode = enabled;
    return this;
  }

  /**
   * Sets the maximum data size
   * 
   * @param maxSize - Maximum size in bytes
   * @returns This builder for chaining
   */
  withMaxDataSize(maxSize: number): ConfigBuilder {
    this._config.maxDataSize = maxSize;
    return this;
  }

  /**
   * Sets the timeout for operations
   * 
   * @param timeout - Timeout in milliseconds
   * @returns This builder for chaining
   */
  withTimeout(timeout: number): ConfigBuilder {
    this._config.timeout = timeout;
    return this;
  }

  /**
   * Merges additional configuration
   * 
   * @param config - Additional configuration
   * @returns This builder for chaining
   */
  merge(config: Partial<SerializationConfig>): ConfigBuilder {
    this._config = { ...this._config, ...config };
    return this;
  }

  /**
   * Builds the configuration
   * 
   * @returns Complete SerializationConfig
   * @throws Error if required fields are missing
   */
  build(): SerializationConfig {
    if (!this._config.defaultFormat) {
      throw new Error('defaultFormat is required');
    }
    if (this._config.currentVersion === undefined) {
      throw new Error('currentVersion is required');
    }
    return this._config as SerializationConfig;
  }

  /**
   * Builds the configuration without validation
   * 
   * @returns SerializationConfig or undefined
   */
  buildUnsafe(): SerializationConfig | undefined {
    return this._config as SerializationConfig;
  }

  /**
   * Resets the builder to default state
   * 
   * @returns This builder for chaining
   */
  reset(): ConfigBuilder {
    this._config = {
      defaultFormat: SerializationFormat.JSON,
      enableVersioning: false,
      currentVersion: '1.0',
      enableValidation: false,
      enablePlugins: true,
      enableHooks: true,
      strictMode: false,
    };
    return this;
  }

  /**
   * Gets the current configuration state
   * 
   * @returns Current partial configuration
   */
  getCurrentState(): Partial<SerializationConfig> {
    return { ...this._config };
  }
}
