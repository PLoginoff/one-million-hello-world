/**
 * Serializer Interface
 * 
 * Defines the contract for serialization operations
 * including response serialization, versioning, and content negotiation.
 */

import {
  ContentType,
  SerializationFormat,
  SerializationResult,
  SerializationConfig,
  SerializationOptions,
  ExtendedSerializationResult,
} from '../types/serialization-types';
import { ISerializationStrategy } from '../strategies/ISerializationStrategy';
import { IValidator } from '../validation/IValidator';
import { ISerializationPlugin } from '../plugins/ISerializationPlugin';
import { IVersioningStrategy } from '../versioning/IVersioningStrategy';
import { SerializationHook, HookType } from '../hooks/SerializationHook';

/**
 * Interface for serialization operations
 */
export interface ISerializer {
  /**
   * Serializes data to specified format
   * 
   * @param data - Data to serialize
   * @param format - Serialization format
   * @param options - Serialization options
   * @returns Serialization result
   */
  serialize<T>(
    data: T,
    format?: SerializationFormat,
    options?: SerializationOptions
  ): Promise<ExtendedSerializationResult>;

  /**
   * Deserializes data from specified format
   * 
   * @param data - Data to deserialize
   * @param format - Serialization format
   * @param options - Serialization options
   * @returns Deserialization result
   */
  deserialize<T>(
    data: string,
    format: SerializationFormat,
    options?: SerializationOptions
  ): Promise<ExtendedSerializationResult & { data?: T }>;

  /**
   * Negotiates content type based on accept header
   * 
   * @param acceptHeader - Accept header value
   * @returns Negotiated content type
   */
  negotiateContentType(acceptHeader: string): ContentType;

  /**
   * Sets serialization configuration
   * 
   * @param config - Serialization configuration
   */
  setConfig(config: Partial<SerializationConfig>): void;

  /**
   * Gets current serialization configuration
   * 
   * @returns Current serialization configuration
   */
  getConfig(): SerializationConfig;

  /**
   * Registers a serialization strategy
   * 
   * @param format - Format name
   * @param strategy - Serialization strategy
   */
  registerStrategy(format: string, strategy: ISerializationStrategy): void;

  /**
   * Gets a serialization strategy
   * 
   * @param format - Format name
   * @returns Serialization strategy or undefined
   */
  getStrategy(format: string): ISerializationStrategy | undefined;

  /**
   * Adds a validator to the validation pipeline
   * 
   * @param validator - Validator to add
   */
  addValidator(validator: IValidator): void;

  /**
   * Removes a validator from the validation pipeline
   * 
   * @param validator - Validator to remove
   */
  removeValidator(validator: IValidator): void;

  /**
   * Registers a plugin
   * 
   * @param plugin - Plugin to register
   */
  registerPlugin(plugin: ISerializationPlugin): Promise<void>;

  /**
   * Unregisters a plugin
   * 
   * @param name - Plugin name
   */
  unregisterPlugin(name: string): Promise<void>;

  /**
   * Registers a hook
   * 
   * @param hook - Hook to register
   */
  registerHook(hook: SerializationHook): void;

  /**
   * Unregisters a hook
   * 
   * @param type - Hook type
   * @param name - Hook name
   */
  unregisterHook(type: HookType, name: string): void;

  /**
   * Sets the versioning strategy
   * 
   * @param strategy - Versioning strategy
   */
  setVersioningStrategy(strategy: IVersioningStrategy): void;

  /**
   * Enables or disables versioning
   * 
   * @param enabled - Enable flag
   */
  setVersioningEnabled(enabled: boolean): void;

  /**
   * Sets the current version
   * 
   * @param version - Version string
   */
  setCurrentVersion(version: string): void;
}
