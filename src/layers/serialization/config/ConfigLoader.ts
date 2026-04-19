/**
 * Configuration Loader
 * 
 * Loads configuration from various sources.
 */

import { SerializationConfig } from '../types/serialization-types';
import { ConfigValidator } from './ConfigValidator';

export interface ConfigSource {
  load(): Promise<Partial<SerializationConfig>> | Partial<SerializationConfig>;
}

export class ObjectConfigSource implements ConfigSource {
  constructor(private _config: Partial<SerializationConfig>) {}

  load(): Partial<SerializationConfig> {
    return { ...this._config };
  }
}

export class ConfigLoader {
  private _sources: ConfigSource[];
  private _validator: ConfigValidator;

  constructor(validator?: ConfigValidator) {
    this._sources = [];
    this._validator = validator ?? new ConfigValidator();
  }

  /**
   * Adds a configuration source
   * 
   * @param source - Configuration source
   * @returns This loader for chaining
   */
  addSource(source: ConfigSource): ConfigLoader {
    this._sources.push(source);
    return this;
  }

  /**
   * Removes a configuration source
   * 
   * @param source - Configuration source
   * @returns This loader for chaining
   */
  removeSource(source: ConfigSource): ConfigLoader {
    const index = this._sources.indexOf(source);
    if (index > -1) {
      this._sources.splice(index, 1);
    }
    return this;
  }

  /**
   * Clears all configuration sources
   * 
   * @returns This loader for chaining
   */
  clearSources(): ConfigLoader {
    this._sources = [];
    return this;
  }

  /**
   * Loads configuration from all sources
   * 
   * @returns Merged configuration
   */
  async load(): Promise<SerializationConfig> {
    let mergedConfig: Partial<SerializationConfig> = {};

    for (const source of this._sources) {
      const config = await Promise.resolve(source.load());
      mergedConfig = { ...mergedConfig, ...config };
    }

    return this._validator.validateAndApplyDefaults(mergedConfig);
  }

  /**
   * Loads configuration synchronously
   * 
   * @returns Merged configuration
   */
  loadSync(): SerializationConfig {
    let mergedConfig: Partial<SerializationConfig> = {};

    for (const source of this._sources) {
      const config = source.load();
      mergedConfig = { ...mergedConfig, ...config };
    }

    return this._validator.validateAndApplyDefaults(mergedConfig);
  }

  /**
   * Gets the validator
   * 
   * @returns Config validator
   */
  getValidator(): ConfigValidator {
    return this._validator;
  }

  /**
   * Sets the validator
   * 
   * @param validator - New validator
   * @returns This loader for chaining
   */
  setValidator(validator: ConfigValidator): ConfigLoader {
    this._validator = validator;
    return this;
  }
}
