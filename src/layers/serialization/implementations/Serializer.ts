/**
 * Serializer Implementation
 * 
 * Concrete implementation of ISerializer with all advanced features:
 * - Strategy pattern for serialization formats
 * - Chain of responsibility for content negotiation
 * - Versioning strategies
 * - Validation pipeline
 * - Plugin system
 * - Hook system
 * - Detailed error handling
 */

import { ISerializer } from '../interfaces/ISerializer';
import {
  ContentType,
  SerializationFormat,
  SerializationConfig,
  SerializationOptions,
  ExtendedSerializationResult,
} from '../types/serialization-types';
import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { JSONStrategy } from '../strategies/JSONStrategy';
import { XMLStrategy } from '../strategies/XMLStrategy';
import { StringStrategy } from '../strategies/StringStrategy';
import { ContentNegotiationManager } from '../content-negotiation/ContentNegotiationManager';
import { VersioningManager } from '../versioning/VersioningManager';
import { WrapperVersioningStrategy } from '../versioning/WrapperVersioningStrategy';
import { ValidationPipeline } from '../validation/ValidationPipeline';
import { PluginManager } from '../plugins/PluginManager';
import { HookManager } from '../hooks/HookManager';
import { HookType, HookContext } from '../hooks/SerializationHook';
import { SerializationError } from '../errors/SerializationError';

export class Serializer implements ISerializer {
  private _config: SerializationConfig;
  private _strategies: Map<string, ISerializationStrategy>;
  private _contentNegotiator: ContentNegotiationManager;
  private _versioningManager: VersioningManager;
  private _validationPipeline: ValidationPipeline;
  private _pluginManager: PluginManager;
  private _hookManager: HookManager;

  constructor(config?: Partial<SerializationConfig>) {
    this._config = {
      defaultFormat: SerializationFormat.JSON,
      enableVersioning: false,
      currentVersion: '1.0',
      enableValidation: false,
      enablePlugins: true,
      enableHooks: true,
      strictMode: false,
      maxDataSize: undefined,
      timeout: undefined,
      ...config,
    };

    this._strategies = new Map();
    this._registerDefaultStrategies();

    this._contentNegotiator = new ContentNegotiationManager();
    this._versioningManager = new VersioningManager(
      new WrapperVersioningStrategy(),
      this._config.currentVersion
    );
    this._validationPipeline = new ValidationPipeline();
    this._pluginManager = new PluginManager();
    this._hookManager = new HookManager();
  }

  async serialize<T>(
    data: T,
    format?: SerializationFormat,
    options?: SerializationOptions
  ): Promise<ExtendedSerializationResult> {
    const targetFormat = format ?? this._config.defaultFormat;
    const opts = {
      validate: this._config.enableValidation,
      skipPlugins: false,
      skipHooks: false,
      ...options,
    };

    const context: HookContext = {
      operation: 'serialize',
      format: targetFormat,
      timestamp: new Date(),
      metadata: opts.metadata,
    };

    try {
      if (this._config.strictMode && this._config.maxDataSize) {
        const dataSize = JSON.stringify(data).length;
        if (dataSize > this._config.maxDataSize) {
          throw SerializationError.serializationFailed({
            dataSize,
            maxSize: this._config.maxDataSize,
          });
        }
      }

      let processedData = data;

      if (!opts.skipHooks && this._config.enableHooks) {
        processedData = await this._hookManager.executeHook(
          HookType.BEFORE_SERIALIZE,
          processedData,
          context
        );
      }

      if (!opts.skipPlugins && this._config.enablePlugins) {
        processedData = await this._pluginManager.executeBeforeSerialize(processedData) as T;
      }

      if (opts.validate && this._config.enableValidation) {
        const validationResult = this._validationPipeline.validate(processedData);
        if (!validationResult.valid) {
          return {
            success: false,
            error: 'Validation failed',
            validationErrors: validationResult.errors,
            validationWarnings: validationResult.warnings,
          };
        }
      }

      const strategy = this._strategies.get(targetFormat);
      if (!strategy) {
        throw SerializationError.unsupportedFormat(targetFormat);
      }

      if (!strategy.canSerialize(processedData)) {
        throw SerializationError.serializationFailed({
          reason: 'Data cannot be serialized by this strategy',
        });
      }

      let serialized = strategy.serialize(processedData);

      if (this._versioningManager.isEnabled()) {
        serialized = this._versioningManager.applyVersioning(serialized);
      }

      if (!opts.skipPlugins && this._config.enablePlugins) {
        serialized = await this._pluginManager.executeAfterSerialize(serialized);
      }

      if (!opts.skipHooks && this._config.enableHooks) {
        serialized = await this._hookManager.executeHook(
          HookType.AFTER_SERIALIZE,
          serialized,
          context
        ) as string;
      }

      return {
        success: true,
        data: serialized,
        contentType: strategy.getContentType(),
        version: this._versioningManager.isEnabled() ? this._versioningManager.getCurrentVersion() : undefined,
        metadata: opts.metadata,
      };
    } catch (error) {
      const serializationError = error instanceof SerializationError
        ? error
        : SerializationError.serializationFailed({}, error instanceof Error ? error : undefined);

      await this._hookManager.executeErrorHooks(serializationError, context);

      return {
        success: false,
        error: serializationError.message,
        warnings: [],
        metadata: opts.metadata,
      };
    }
  }

  async deserialize<T>(
    data: string,
    format: SerializationFormat,
    options?: SerializationOptions
  ): Promise<ExtendedSerializationResult & { data?: T }> {
    const opts = {
      validate: this._config.enableValidation,
      skipPlugins: false,
      skipHooks: false,
      ...options,
    };

    const context: HookContext = {
      operation: 'deserialize',
      format,
      timestamp: new Date(),
      metadata: opts.metadata,
    };

    try {
      let processedData = data;

      if (!opts.skipHooks && this._config.enableHooks) {
        processedData = await this._hookManager.executeHook(
          HookType.BEFORE_DESERIALIZE,
          processedData,
          context
        ) as string;
      }

      if (!opts.skipPlugins && this._config.enablePlugins) {
        processedData = await this._pluginManager.executeBeforeDeserialize(processedData);
      }

      if (this._versioningManager.isEnabled() && this._versioningManager.isVersioned(processedData)) {
        const versionInfo = this._versioningManager.extractVersion(processedData);
        if (versionInfo) {
          processedData = versionInfo.data;
        }
      }

      const strategy = this._strategies.get(format);
      if (!strategy) {
        throw SerializationError.unsupportedFormat(format);
      }

      if (!strategy.canDeserialize(processedData)) {
        throw SerializationError.deserializationFailed({
          reason: 'Data cannot be deserialized by this strategy',
        });
      }

      let deserialized = strategy.deserialize(processedData) as unknown;

      if (!opts.skipPlugins && this._config.enablePlugins) {
        deserialized = await this._pluginManager.executeAfterDeserialize(deserialized);
      }

      if (!opts.skipHooks && this._config.enableHooks) {
        deserialized = await this._hookManager.executeHook(
          HookType.AFTER_DESERIALIZE,
          deserialized,
          context
        );
      }

      if (opts.validate && this._config.enableValidation) {
        const validationResult = this._validationPipeline.validate(deserialized);
        if (!validationResult.valid) {
          return {
            success: false,
            error: 'Validation failed',
            validationErrors: validationResult.errors,
            validationWarnings: validationResult.warnings,
          };
        }
      }

      return {
        success: true,
        data: deserialized as T,
        contentType: strategy.getContentType(),
        metadata: opts.metadata,
      } as ExtendedSerializationResult & { data?: T };
    } catch (error) {
      const serializationError = error instanceof SerializationError
        ? error
        : SerializationError.deserializationFailed({}, error instanceof Error ? error : undefined);

      await this._hookManager.executeErrorHooks(serializationError, context);

      return {
        success: false,
        error: serializationError.message,
        warnings: [],
        metadata: opts.metadata,
      };
    }
  }

  negotiateContentType(acceptHeader: string): ContentType {
    return this._contentNegotiator.negotiate(acceptHeader);
  }

  setConfig(config: Partial<SerializationConfig>): void {
    this._config = { ...this._config, ...config };
    this._versioningManager.setCurrentVersion(this._config.currentVersion);
    this._versioningManager.setEnabled(this._config.enableVersioning);
    this._pluginManager.setEnabled(this._config.enablePlugins);
    this._hookManager.setEnabled(this._config.enableHooks);
  }

  getConfig(): SerializationConfig {
    return { ...this._config };
  }

  registerStrategy(format: string, strategy: ISerializationStrategy): void {
    this._strategies.set(format, strategy);
  }

  getStrategy(format: string): ISerializationStrategy | undefined {
    return this._strategies.get(format);
  }

  addValidator(validator: import('../validation/IValidator').IValidator): void {
    this._validationPipeline.addValidator(validator);
  }

  removeValidator(validator: import('../validation/IValidator').IValidator): void {
    this._validationPipeline.removeValidator(validator);
  }

  async registerPlugin(plugin: import('../plugins/ISerializationPlugin').ISerializationPlugin): Promise<void> {
    await this._pluginManager.registerPlugin(plugin);
  }

  async unregisterPlugin(name: string): Promise<void> {
    await this._pluginManager.unregisterPlugin(name);
  }

  registerHook(hook: import('../hooks/SerializationHook').SerializationHook): void {
    this._hookManager.registerHook(hook);
  }

  unregisterHook(type: HookType, name: string): void {
    this._hookManager.unregisterHook(type, name);
  }

  setVersioningStrategy(strategy: import('../versioning/IVersioningStrategy').IVersioningStrategy): void {
    this._versioningManager.setStrategy(strategy);
  }

  setVersioningEnabled(enabled: boolean): void {
    this._versioningManager.setEnabled(enabled);
    this._config.enableVersioning = enabled;
  }

  setCurrentVersion(version: string): void {
    this._versioningManager.setCurrentVersion(version);
    this._config.currentVersion = version;
  }

  private _registerDefaultStrategies(): void {
    this._strategies.set(SerializationFormat.JSON, new JSONStrategy());
    this._strategies.set(SerializationFormat.XML, new XMLStrategy());
    this._strategies.set(SerializationFormat.STRING, new StringStrategy());
  }
}
