/**
 * Serializer Builder
 * 
 * Fluent builder for creating configured Serializer instances.
 */

import { Serializer } from '../implementations/Serializer';
import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { IValidator } from '../validation/IValidator';
import { ISerializationPlugin } from '../plugins/ISerializationPlugin';
import { SerializationHook } from '../hooks/SerializationHook';
import { SerializationConfig } from '../types/serialization-types';
import { SerializationFormat } from '../types/serialization-types';
import { ConfigBuilder } from './ConfigBuilder';
import { IVersioningStrategy } from '../versioning/IVersioningStrategy';

export class SerializerBuilder {
  private _configBuilder: ConfigBuilder;
  private _strategies: Map<string, ISerializationStrategy>;
  private _validators: IValidator[];
  private _plugins: ISerializationPlugin[];
  private _hooks: SerializationHook[];
  private _versioningStrategy?: IVersioningStrategy;

  constructor() {
    this._configBuilder = new ConfigBuilder();
    this._strategies = new Map();
    this._validators = [];
    this._plugins = [];
    this._hooks = [];
  }

  /**
   * Sets the default serialization format
   * 
   * @param format - Default format
   * @returns This builder for chaining
   */
  withDefaultFormat(format: SerializationFormat): SerializerBuilder {
    this._configBuilder.withDefaultFormat(format);
    return this;
  }

  /**
   * Enables or disables versioning
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withVersioning(enabled: boolean): SerializerBuilder {
    this._configBuilder.withVersioning(enabled);
    return this;
  }

  /**
   * Sets the current version
   * 
   * @param version - Version string
   * @returns This builder for chaining
   */
  withCurrentVersion(version: string): SerializerBuilder {
    this._configBuilder.withCurrentVersion(version);
    return this;
  }

  /**
   * Enables or disables validation
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withValidation(enabled: boolean): SerializerBuilder {
    this._configBuilder.withValidation(enabled);
    return this;
  }

  /**
   * Enables or disables plugins
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withPlugins(enabled: boolean): SerializerBuilder {
    this._configBuilder.withPlugins(enabled);
    return this;
  }

  /**
   * Enables or disables hooks
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withHooks(enabled: boolean): SerializerBuilder {
    this._configBuilder.withHooks(enabled);
    return this;
  }

  /**
   * Enables or disables strict mode
   * 
   * @param enabled - Enable flag
   * @returns This builder for chaining
   */
  withStrictMode(enabled: boolean): SerializerBuilder {
    this._configBuilder.withStrictMode(enabled);
    return this;
  }

  /**
   * Sets the maximum data size
   * 
   * @param maxSize - Maximum size in bytes
   * @returns This builder for chaining
   */
  withMaxDataSize(maxSize: number): SerializerBuilder {
    this._configBuilder.withMaxDataSize(maxSize);
    return this;
  }

  /**
   * Sets the timeout for operations
   * 
   * @param timeout - Timeout in milliseconds
   * @returns This builder for chaining
   */
  withTimeout(timeout: number): SerializerBuilder {
    this._configBuilder.withTimeout(timeout);
    return this;
  }

  /**
   * Adds a custom serialization strategy
   * 
   * @param format - Format name
   * @param strategy - Strategy instance
   * @returns This builder for chaining
   */
  withStrategy(format: string, strategy: ISerializationStrategy): SerializerBuilder {
    this._strategies.set(format, strategy);
    return this;
  }

  /**
   * Adds a validator
   * 
   * @param validator - Validator instance
   * @returns This builder for chaining
   */
  withValidator(validator: IValidator): SerializerBuilder {
    this._validators.push(validator);
    return this;
  }

  /**
   * Adds multiple validators
   * 
   * @param validators - Array of validators
   * @returns This builder for chaining
   */
  withValidators(validators: IValidator[]): SerializerBuilder {
    this._validators.push(...validators);
    return this;
  }

  /**
   * Adds a plugin
   * 
   * @param plugin - Plugin instance
   * @returns This builder for chaining
   */
  withPlugin(plugin: ISerializationPlugin): SerializerBuilder {
    this._plugins.push(plugin);
    return this;
  }

  /**
   * Adds multiple plugins
   * 
   * @param plugins - Array of plugins
   * @returns This builder for chaining
   */
  withPluginsArray(plugins: ISerializationPlugin[]): SerializerBuilder {
    this._plugins.push(...plugins);
    return this;
  }

  /**
   * Adds a hook
   * 
   * @param hook - Hook instance
   * @returns This builder for chaining
   */
  withHook(hook: SerializationHook): SerializerBuilder {
    this._hooks.push(hook);
    return this;
  }

  /**
   * Adds multiple hooks
   * 
   * @param hooks - Array of hooks
   * @returns This builder for chaining
   */
  withHooksArray(hooks: SerializationHook[]): SerializerBuilder {
    this._hooks.push(...hooks);
    return this;
  }

  /**
   * Sets the versioning strategy
   * 
   * @param strategy - Versioning strategy
   * @returns This builder for chaining
   */
  withVersioningStrategy(strategy: IVersioningStrategy): SerializerBuilder {
    this._versioningStrategy = strategy;
    return this;
  }

  /**
   * Merges additional configuration
   * 
   * @param config - Additional configuration
   * @returns This builder for chaining
   */
  mergeConfig(config: Partial<SerializationConfig>): SerializerBuilder {
    this._configBuilder.merge(config);
    return this;
  }

  /**
   * Builds the Serializer instance
   * 
   * @returns Configured Serializer instance
   */
  build(): Serializer {
    const config = this._configBuilder.build();
    const serializer = new Serializer(config);

    for (const [format, strategy] of this._strategies) {
      serializer.registerStrategy(format, strategy);
    }

    for (const validator of this._validators) {
      serializer.addValidator(validator);
    }

    for (const plugin of this._plugins) {
      serializer.registerPlugin(plugin);
    }

    for (const hook of this._hooks) {
      serializer.registerHook(hook);
    }

    if (this._versioningStrategy) {
      serializer.setVersioningStrategy(this._versioningStrategy);
    }

    return serializer;
  }

  /**
   * Resets the builder to default state
   * 
   * @returns This builder for chaining
   */
  reset(): SerializerBuilder {
    this._configBuilder.reset();
    this._strategies.clear();
    this._validators = [];
    this._plugins = [];
    this._hooks = [];
    this._versioningStrategy = undefined;
    return this;
  }

  /**
   * Gets the current configuration builder
   * 
   * @returns ConfigBuilder instance
   */
  getConfigBuilder(): ConfigBuilder {
    return this._configBuilder;
  }
}
