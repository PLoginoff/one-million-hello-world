/**
 * Configuration Validator
 * 
 * Validates serialization configuration using schema.
 */

import { SerializationConfig } from '../types/serialization-types';
import { ConfigSchema, SchemaDefinition, defaultSerializationConfigSchema } from './ConfigSchema';

export class ConfigValidator {
  private _schema: ConfigSchema;

  constructor(schema?: SchemaDefinition) {
    this._schema = new ConfigSchema(schema ?? defaultSerializationConfigSchema);
  }

  /**
   * Validates configuration
   * 
   * @param config - Configuration to validate
   * @returns Validation result
   */
  validate(config: Partial<SerializationConfig>): { valid: boolean; errors: string[] } {
    return this._schema.validate(config);
  }

  /**
   * Validates configuration and throws if invalid
   * 
   * @param config - Configuration to validate
   * @throws Error if validation fails
   */
  validateOrThrow(config: Partial<SerializationConfig>): void {
    const result = this.validate(config);
    if (!result.valid) {
      throw new Error(`Configuration validation failed:\n${result.errors.join('\n')}`);
    }
  }

  /**
   * Validates and applies defaults
   * 
   * @param config - Configuration to validate
   * @returns Validated configuration with defaults
   */
  validateAndApplyDefaults(config: Partial<SerializationConfig>): SerializationConfig {
    this.validateOrThrow(config);
    return this._schema.applyDefaults(config) as SerializationConfig;
  }

  /**
   * Gets the schema
   * 
   * @returns Config schema
   */
  getSchema(): ConfigSchema {
    return this._schema;
  }

  /**
   * Sets a custom schema
   * 
   * @param schema - New schema definition
   */
  setSchema(schema: SchemaDefinition): void {
    this._schema = new ConfigSchema(schema);
  }

  /**
   * Adds a property to the schema
   * 
   * @param key - Property key
   * @param property - Property definition
   */
  addProperty(key: string, property: import('./ConfigSchema').SchemaProperty): void {
    const schema = this._schema.getSchema();
    schema[key] = property;
    this._schema = new ConfigSchema(schema);
  }

  /**
   * Removes a property from the schema
   * 
   * @param key - Property key
   */
  removeProperty(key: string): void {
    const schema = this._schema.getSchema();
    delete schema[key];
    this._schema = new ConfigSchema(schema);
  }
}
