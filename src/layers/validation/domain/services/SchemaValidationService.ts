/**
 * Schema Validation Service
 * 
 * Provides schema-based validation.
 */

export interface ValidationSchema {
  [field: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    properties?: ValidationSchema;
    items?: ValidationSchema;
  };
}

export class SchemaValidationService {
  /**
   * Validate data against schema
   */
  static validate(data: any, schema: ValidationSchema): {
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
  } {
    const errors: Array<{ field: string; message: string }> = [];

    for (const [field, fieldSchema] of Object.entries(schema)) {
      const value = data[field];
      const result = this.validateField(field, value, fieldSchema, data);
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
    value: any,
    schema: ValidationSchema[string],
    parent: any
  ): Array<{ field: string; message: string }> {
    const errors: Array<{ field: string; message: string }> = [];

    if (value === undefined || value === null) {
      if (schema.required) {
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

    if (schema.pattern && typeof value === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({ field, message: `${field} does not match required pattern` });
      }
    }

    if (schema.type === 'object' && schema.properties) {
      for (const [subField, subSchema] of Object.entries(schema.properties)) {
        const subValue = value[subField];
        errors.push(...this.validateField(`${field}.${subField}`, subValue, subSchema, value));
      }
    }

    if (schema.type === 'array' && schema.items) {
      for (let i = 0; i < value.length; i++) {
        errors.push(...this.validateField(`${field}[${i}]`, value[i], schema.items, value));
      }
    }

    return errors;
  }

  /**
   * Validate partial data against schema (ignore missing fields)
   */
  static validatePartial(data: any, schema: ValidationSchema): {
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
