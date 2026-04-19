/**
 * Configuration Schema
 * 
 * Schema definition for configuration validation.
 */

import { SerializationConfig } from '../types/serialization-types';
import { SerializationFormat } from '../types/serialization-types';

export interface SchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  enum?: unknown[];
  min?: number;
  max?: number;
  pattern?: string;
  default?: unknown;
  description?: string;
}

export interface SchemaDefinition {
  [key: string]: SchemaProperty;
}

export class ConfigSchema {
  private _schema: SchemaDefinition;

  constructor(schema: SchemaDefinition) {
    this._schema = schema;
  }

  /**
   * Validates configuration against schema
   * 
   * @param config - Configuration to validate
   * @returns Validation result
   */
  validate(config: Partial<SerializationConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [key, property] of Object.entries(this._schema)) {
      const value = config[key as keyof SerializationConfig];

      if (property.required && value === undefined) {
        errors.push(`Required property '${key}' is missing`);
        continue;
      }

      if (value !== undefined) {
        const propertyErrors = this._validateProperty(key, value, property);
        errors.push(...propertyErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates a single property
   * 
   * @param key - Property key
   * @param value - Property value
   * @param property - Property schema
   * @returns Array of error messages
   */
  private _validateProperty(key: string, value: unknown, property: SchemaProperty): string[] {
    const errors: string[] = [];

    if (!this._checkType(value, property.type)) {
      errors.push(`Property '${key}' must be of type ${property.type}`);
      return errors;
    }

    if (property.enum && !property.enum.includes(value)) {
      errors.push(`Property '${key}' must be one of: ${property.enum.join(', ')}`);
    }

    if (property.min !== undefined) {
      if (typeof value === 'number' && value < property.min) {
        errors.push(`Property '${key}' must be >= ${property.min}`);
      }
      if (typeof value === 'string' && value.length < property.min) {
        errors.push(`Property '${key}' must be at least ${property.min} characters`);
      }
    }

    if (property.max !== undefined) {
      if (typeof value === 'number' && value > property.max) {
        errors.push(`Property '${key}' must be <= ${property.max}`);
      }
      if (typeof value === 'string' && value.length > property.max) {
        errors.push(`Property '${key}' must be at most ${property.max} characters`);
      }
    }

    if (property.pattern && typeof value === 'string') {
      const regex = new RegExp(property.pattern);
      if (!regex.test(value)) {
        errors.push(`Property '${key}' does not match pattern ${property.pattern}`);
      }
    }

    return errors;
  }

  /**
   * Checks if value matches type
   * 
   * @param value - Value to check
   * @param type - Expected type
   * @returns True if type matches
   */
  private _checkType(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return false;
    }
  }

  /**
   * Gets default values for missing properties
   * 
   * @returns Object with default values
   */
  getDefaults(): Partial<SerializationConfig> {
    const defaults: Partial<SerializationConfig> = {};

    for (const [key, property] of Object.entries(this._schema)) {
      if (property.default !== undefined) {
        defaults[key as keyof SerializationConfig] = property.default as any;
      }
    }

    return defaults;
  }

  /**
   * Applies defaults to configuration
   * 
   * @param config - Configuration to apply defaults to
   * @returns Configuration with defaults applied
   */
  applyDefaults(config: Partial<SerializationConfig>): Partial<SerializationConfig> {
    return {
      ...this.getDefaults(),
      ...config,
    };
  }

  /**
   * Gets the schema definition
   * 
   * @returns Schema definition
   */
  getSchema(): SchemaDefinition {
    return { ...this._schema };
  }
}

export const defaultSerializationConfigSchema: SchemaDefinition = {
  defaultFormat: {
    type: 'string',
    required: true,
    enum: Object.values(SerializationFormat),
    description: 'Default serialization format',
  },
  enableVersioning: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'Enable versioning',
  },
  currentVersion: {
    type: 'string',
    required: false,
    default: '1.0',
    pattern: '^\\d+\\.\\d+(\\.\\d+)?$',
    description: 'Current version',
  },
  enableValidation: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'Enable validation',
  },
  enablePlugins: {
    type: 'boolean',
    required: false,
    default: true,
    description: 'Enable plugins',
  },
  enableHooks: {
    type: 'boolean',
    required: false,
    default: true,
    description: 'Enable hooks',
  },
  strictMode: {
    type: 'boolean',
    required: false,
    default: false,
    description: 'Enable strict mode',
  },
  maxDataSize: {
    type: 'number',
    required: false,
    min: 0,
    description: 'Maximum data size in bytes',
  },
  timeout: {
    type: 'number',
    required: false,
    min: 0,
    description: 'Timeout in milliseconds',
  },
};
