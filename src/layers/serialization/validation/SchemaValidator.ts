/**
 * Schema Validator
 * 
 * Validates data against a schema.
 */

import { IValidator, ValidationResult } from './IValidator';

export interface Schema {
  type?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export class SchemaValidator implements IValidator {
  private readonly _schema: Schema;

  constructor(schema: Schema) {
    this._schema = schema;
  }

  validate(data: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    this._validate(data, this._schema, '', errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  getValidatorName(): string {
    return 'schema';
  }

  private _validate(
    data: unknown,
    schema: Schema,
    path: string,
    errors: string[],
    warnings: string[]
  ): void {
    if (schema.type) {
      const actualType = typeof data;
      if (actualType !== schema.type) {
        errors.push(`${path || 'root'}: Expected type '${schema.type}', got '${actualType}'`);
      }
    }

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;

      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in obj)) {
            errors.push(`${path || 'root'}: Required field '${field}' is missing`);
          }
        }
      }

      if (schema.properties) {
        for (const [key, value] of Object.entries(obj)) {
          if (schema.properties[key]) {
            this._validate(value, schema.properties[key], `${path}.${key}`, errors, warnings);
          } else if (schema.additionalProperties === false) {
            warnings.push(`${path || 'root'}: Additional property '${key}' not allowed`);
          }
        }
      }
    }

    if (typeof data === 'string') {
      const str = data as string;

      if (schema.minLength !== undefined && str.length < schema.minLength) {
        errors.push(`${path || 'root'}: String length ${str.length} is less than minimum ${schema.minLength}`);
      }

      if (schema.maxLength !== undefined && str.length > schema.maxLength) {
        errors.push(`${path || 'root'}: String length ${str.length} exceeds maximum ${schema.maxLength}`);
      }

      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(str)) {
          errors.push(`${path || 'root'}: String does not match pattern '${schema.pattern}'`);
        }
      }
    }

    if (Array.isArray(data)) {
      const arr = data as unknown[];

      if (schema.minItems !== undefined && arr.length < schema.minItems) {
        errors.push(`${path || 'root'}: Array length ${arr.length} is less than minimum ${schema.minItems}`);
      }

      if (schema.maxItems !== undefined && arr.length > schema.maxItems) {
        errors.push(`${path || 'root'}: Array length ${arr.length} exceeds maximum ${schema.maxItems}`);
      }
    }
  }
}
