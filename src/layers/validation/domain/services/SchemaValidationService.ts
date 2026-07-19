/**
 * Schema Validation Service
 *
 * Provides schema-based validation.
 */

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  properties?: Record<string, FieldSchema>;
  items?: FieldSchema;
}

export interface ValidationSchema {
  [field: string]: FieldSchema;
}

export class SchemaValidationService {
  /**
   * Validate data against schema
   */
  static validate(
    data: unknown,
    schema: ValidationSchema
  ): {
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
  } {
    const errors: Array<{ field: string; message: string }> = [];

    const dataRecord = data as Record<string, unknown>;
    for (const [field, fieldSchema] of Object.entries(schema)) {
      const value = dataRecord[field];
      const result = this.validateField(field, value, fieldSchema, dataRecord);
      errors.push(...result);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate single field
   */
  private static validateField(
    field: string,
    value: unknown,
    schema: FieldSchema,
    _parent: unknown
  ): Array<{ field: string; message: string }> {
    const errors: Array<{ field: string; message: string }> = [];

    if (value === undefined || value === null) {
      if (schema.required === true) {
        errors.push({ field, message: `${field} is required` });
      }
      return errors;
    }

    if (schema.type === 'string' && typeof value !== 'string') {
      errors.push({ field, message: `${field} must be a string` });
      return errors;
    }

    if (schema.type === 'number' && typeof value !== 'number') {
      errors.push({ field, message: `${field} must be a number` });
      return errors;
    }

    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      errors.push({ field, message: `${field} must be a boolean` });
      return errors;
    }

    if (schema.type === 'array' && !Array.isArray(value)) {
      errors.push({ field, message: `${field} must be an array` });
      return errors;
    }

    if (schema.type === 'object' && typeof value !== 'object') {
      errors.push({ field, message: `${field} must be an object` });
      return errors;
    }

    if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
      errors.push({ field, message: `${field} must be at least ${schema.minLength} characters` });
    }

    if (schema.maxLength !== undefined && typeof value === 'string' && value.length > schema.maxLength) {
      errors.push({ field, message: `${field} must not exceed ${schema.maxLength} characters` });
    }

    if (schema.min !== undefined && typeof value === 'number' && value < schema.min) {
      errors.push({ field, message: `${field} must be at least ${schema.min}` });
    }

    if (schema.max !== undefined && typeof value === 'number' && value > schema.max) {
      errors.push({ field, message: `${field} must not exceed ${schema.max}` });
    }

    if (schema.pattern !== undefined && schema.pattern !== null && schema.pattern !== '' && typeof value === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({ field, message: `${field} does not match required pattern` });
      }
    }

    if (schema.type === 'object' && schema.properties) {
      const obj = value as Record<string, unknown>;
      for (const [subField, subSchema] of Object.entries(schema.properties)) {
        const subValue = obj[subField];
        errors.push(...this.validateField(`${field}.${subField}`, subValue, subSchema, obj));
      }
    }

    if (schema.type === 'array' && schema.items) {
      const arr = value as unknown[];
      for (let i = 0; i < arr.length; i++) {
        errors.push(...this.validateField(`${field}[${i}]`, arr[i], schema.items, arr));
      }
    }

    return errors;
  }

  /**
   * Validate partial data against schema (ignore missing fields)
   */
  static validatePartial(
    data: unknown,
    schema: ValidationSchema
  ): {
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
  } {
    const partialSchema: ValidationSchema = {};
    for (const [field, fieldSchema] of Object.entries(schema)) {
      partialSchema[field] = { ...fieldSchema, required: false };
    }
    return this.validate(data, partialSchema);
  }
}
