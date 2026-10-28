/**
 * Default Validation Strategy
 *
 * Base implementation of the validation strategy with balanced performance.
 * This strategy performs standard field-by-field validation with sanitization.
 *
 * @module ValidationLayer/Strategies
 */

import { IValidationStrategy, ValidationStrategyContext, ValidationStrategyResult } from './IValidationStrategy';
import {
  FieldType,
  ValidationErrorCode,
  ValidationWarningCode,
  ValidationSeverity,
  SanitizerType,
} from '../types/validation-types';

/**
 * Default validation strategy implementation.
 *
 * Performs comprehensive field validation including type checking,
 * format validation, range checking, and sanitization.
 */
export class DefaultValidationStrategy implements IValidationStrategy {
  readonly name = 'default-validation';
  readonly priority = 10;

  private executionCount = 0;

  /**
   * Check if this strategy can handle the given context.
   *
   * @param context - The validation context to evaluate
   * @returns True if the context has required fields
   */
  canHandle(context: ValidationStrategyContext): boolean {
    return (
      context.data !== undefined &&
      context.data !== null &&
      typeof context.data === 'object' &&
      context.schema !== undefined &&
      context.schema !== null &&
      typeof context.schema === 'object'
    );
  }

  /**
   * Execute the validation strategy.
   *
   * Performs field-by-field validation against the schema.
   *
   * @param context - The validation context
   * @returns Promise resolving to the validation result
   */
  async execute(context: ValidationStrategyContext): Promise<ValidationStrategyResult> {
    const startTime = Date.now();
    this.executionCount++;

    if (!this.canHandle(context)) {
      return {
        success: false,
        errors: [
          {
            field: '_root',
            code: ValidationErrorCode.CUSTOM,
            message: 'Invalid validation context: data and schema are required',
            severity: ValidationSeverity.ERROR,
          },
        ],
        warnings: [],
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          fieldsValidated: 0,
          fieldsPassed: 0,
          fieldsFailed: 0,
          fieldsSkipped: 0,
          sanitizationDurationMs: 0,
        },
      };
    }

    const sanitizeStartTime = Date.now();
    const errors: ValidationStrategyResult['errors'] = [];
    const warnings: ValidationStrategyResult['warnings'] = [];
    let fieldsValidated = 0;
    let fieldsPassed = 0;
    let fieldsFailed = 0;
    let fieldsSkipped = 0;
    const sanitizedData: Record<string, unknown> = { ...context.data };

    const schema = context.schema;
    const fields = schema.fields ?? {};

    for (const [fieldName, fieldValidation] of Object.entries(fields)) {
      fieldsValidated++;
      const value = sanitizedData[fieldName];

      // Check required
      if (fieldValidation.required && (value === undefined || value === null)) {
        if (!fieldValidation.allowNull && !fieldValidation.allowUndefined) {
          errors.push({
            field: fieldName,
            code: ValidationErrorCode.REQUIRED,
            message: `Field '${fieldName}' is required`,
            value,
            severity: ValidationSeverity.ERROR,
          });
          fieldsFailed++;
          continue;
        }
      }

      // Skip validation for null/undefined if allowed
      if (value === null && fieldValidation.allowNull) {
        fieldsPassed++;
        continue;
      }
      if (value === undefined && fieldValidation.allowUndefined) {
        fieldsPassed++;
        continue;
      }

      // Type validation
      const typeResult = this.validateType(fieldName, value, fieldValidation);
      if (!typeResult.valid) {
        errors.push(...typeResult.errors);
        fieldsFailed++;
        continue;
      }

      // Format/constraint validation
      const constraintResult = this.validateConstraints(fieldName, value, fieldValidation);
      errors.push(...constraintResult.errors);
      warnings.push(...constraintResult.warnings);

      if (constraintResult.errors.length > 0) {
        fieldsFailed++;
        continue;
      }

      // Sanitization
      if (context.sanitize && fieldValidation.sanitizers) {
        for (const sanitizer of fieldValidation.sanitizers) {
          const sanitized = this.applySanitizer(value, sanitizer);
          if (sanitized !== value) {
            sanitizedData[fieldName] = sanitized;
          }
        }
      }

      fieldsPassed++;
    }

    // Cross-field validation
    if (context.enableCrossFieldValidation && schema.crossFieldRules) {
      for (const rule of schema.crossFieldRules) {
        if (!rule.enabled) {
          fieldsSkipped++;
          continue;
        }
        const ruleValues: Record<string, unknown> = {};
        for (const field of rule.fields) {
          ruleValues[field] = sanitizedData[field];
        }
        if (!rule.validator(ruleValues, context.context)) {
          errors.push({
            field: rule.fields.join(','),
            code: ValidationErrorCode.CROSS_FIELD_VALIDATION,
            message: rule.errorMessage,
            severity: ValidationSeverity.ERROR,
          });
          fieldsFailed++;
        }
      }
    }

    // Conditional validation
    if (context.enableConditionalValidation && schema.conditionalRules) {
      for (const rule of schema.conditionalRules) {
        if (!rule.enabled) {
          fieldsSkipped++;
          continue;
        }
        if (rule.condition(sanitizedData, context.context)) {
          // Apply 'then' schema - simplified for this implementation
          // In a full implementation, this would recursively validate
        } else if (rule.otherwise) {
          // Apply 'otherwise' schema
        }
      }
    }

    const sanitizationDurationMs = Date.now() - sanitizeStartTime;
    const executionTimeMs = Date.now() - startTime;

    return {
      success: errors.length === 0,
      data: context.sanitize ? sanitizedData : undefined,
      errors,
      warnings,
      metadata: {
        strategyName: this.name,
        executionTimeMs,
        fieldsValidated,
        fieldsPassed,
        fieldsFailed,
        fieldsSkipped,
        sanitizationDurationMs,
      },
    };
  }

  /**
   * Validate field type.
   */
  private validateType(
    fieldName: string,
    value: unknown,
    validation: ValidationStrategyContext['schema']['fields'][string]
  ): { valid: boolean; errors: ValidationStrategyResult['errors'] } {
    const errors: ValidationStrategyResult['errors'] = [];

    if (value === null || value === undefined) {
      return { valid: true, errors: [] };
    }

    switch (validation.type) {
      case FieldType.STRING:
        if (typeof value !== 'string') {
          errors.push({
            field: fieldName,
            code: ValidationErrorCode.INVALID_TYPE,
            message: `Field '${fieldName}' must be a string`,
            value,
            severity: ValidationSeverity.ERROR,
          });
        }
        break;
      case FieldType.NUMBER:
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push({
            field: fieldName,
            code: ValidationErrorCode.INVALID_TYPE,
            message: `Field '${fieldName}' must be a number`,
            value,
            severity: ValidationSeverity.ERROR,
          });
        }
        break;
      case FieldType.BOOLEAN:
        if (typeof value !== 'boolean') {
          errors.push({
            field: fieldName,
            code: ValidationErrorCode.INVALID_TYPE,
            message: `Field '${fieldName}' must be a boolean`,
            value,
            severity: ValidationSeverity.ERROR,
          });
        }
        break;
      case FieldType.DATE:
        if (!(value instanceof Date) && (typeof value !== 'string' || Number.isNaN(Date.parse(value)))) {
          errors.push({
            field: fieldName,
            code: ValidationErrorCode.INVALID_DATE,
            message: `Field '${fieldName}' must be a valid date`,
            value,
            severity: ValidationSeverity.ERROR,
          });
        }
        break;
      case FieldType.ARRAY:
        if (!Array.isArray(value)) {
          errors.push({
            field: fieldName,
            code: ValidationErrorCode.INVALID_TYPE,
            message: `Field '${fieldName}' must be an array`,
            value,
            severity: ValidationSeverity.ERROR,
          });
        }
        break;
      case FieldType.OBJECT:
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          errors.push({
            field: fieldName,
            code: ValidationErrorCode.INVALID_TYPE,
            message: `Field '${fieldName}' must be an object`,
            value,
            severity: ValidationSeverity.ERROR,
          });
        }
        break;
      case FieldType.UUID:
        if (typeof value !== 'string' || !this.isValidUUID(value)) {
          errors.push({
            field: fieldName,
            code: ValidationErrorCode.INVALID_UUID,
            message: `Field '${fieldName}' must be a valid UUID`,
            value,
            severity: ValidationSeverity.ERROR,
          });
        }
        break;
      case FieldType.EMAIL:
        if (typeof value !== 'string' || !this.isValidEmail(value)) {
          errors.push({
            field: fieldName,
            code: ValidationErrorCode.INVALID_EMAIL,
            message: `Field '${fieldName}' must be a valid email`,
            value,
            severity: ValidationSeverity.ERROR,
          });
        }
        break;
      case FieldType.URL:
        if (typeof value !== 'string' || !this.isValidURL(value)) {
          errors.push({
            field: fieldName,
            code: ValidationErrorCode.INVALID_URL,
            message: `Field '${fieldName}' must be a valid URL`,
            value,
            severity: ValidationSeverity.ERROR,
          });
        }
        break;
      case FieldType.ANY:
        // Accept any type
        break;
      default:
        // Unknown type, skip validation
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate field constraints.
   */
  private validateConstraints(
    fieldName: string,
    value: unknown,
    validation: ValidationStrategyContext['schema']['fields'][string]
  ): { errors: ValidationStrategyResult['errors']; warnings: ValidationStrategyResult['warnings'] } {
    const errors: ValidationStrategyResult['errors'] = [];
    const warnings: ValidationStrategyResult['warnings'] = [];

    if (value === null || value === undefined) {
      return { errors, warnings };
    }

    // String constraints
    if (typeof value === 'string') {
      if (validation.minLength !== undefined && value.length < validation.minLength) {
        errors.push({
          field: fieldName,
          code: ValidationErrorCode.INVALID_LENGTH,
          message: `Field '${fieldName}' must be at least ${validation.minLength} characters`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
      if (validation.maxLength !== undefined && value.length > validation.maxLength) {
        errors.push({
          field: fieldName,
          code: ValidationErrorCode.INVALID_LENGTH,
          message: `Field '${fieldName}' must be at most ${validation.maxLength} characters`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
      if (validation.pattern && !validation.pattern.test(value)) {
        errors.push({
          field: fieldName,
          code: ValidationErrorCode.INVALID_PATTERN,
          message: `Field '${fieldName}' does not match required pattern`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
      if (validation.enum && !validation.enum.includes(value)) {
        errors.push({
          field: fieldName,
          code: ValidationErrorCode.INVALID_ENUM,
          message: `Field '${fieldName}' must be one of: ${validation.enum.join(', ')}`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
    }

    // Number constraints
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        errors.push({
          field: fieldName,
          code: ValidationErrorCode.INVALID_RANGE,
          message: `Field '${fieldName}' must be at least ${validation.min}`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
      if (validation.max !== undefined && value > validation.max) {
        errors.push({
          field: fieldName,
          code: ValidationErrorCode.INVALID_RANGE,
          message: `Field '${fieldName}' must be at most ${validation.max}`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
    }

    // Array constraints
    if (Array.isArray(value)) {
      if (validation.arrayMinLength !== undefined && value.length < validation.arrayMinLength) {
        errors.push({
          field: fieldName,
          code: ValidationErrorCode.INVALID_ARRAY_LENGTH,
          message: `Field '${fieldName}' must have at least ${validation.arrayMinLength} items`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
      if (validation.arrayMaxLength !== undefined && value.length > validation.arrayMaxLength) {
        errors.push({
          field: fieldName,
          code: ValidationErrorCode.INVALID_ARRAY_LENGTH,
          message: `Field '${fieldName}' must have at most ${validation.arrayMaxLength} items`,
          value,
          severity: ValidationSeverity.ERROR,
        });
      }
    }

    // Object constraints
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if (validation.objectRequiredKeys) {
        for (const key of validation.objectRequiredKeys) {
          if (!(key in obj)) {
            errors.push({
              field: fieldName,
              code: ValidationErrorCode.INVALID_OBJECT_KEYS,
              message: `Field '${fieldName}' must have required key: ${key}`,
              value,
              severity: ValidationSeverity.ERROR,
            });
          }
        }
      }
      if (validation.objectAllowedKeys) {
        for (const key of Object.keys(obj)) {
          if (!validation.objectAllowedKeys.includes(key)) {
            warnings.push({
              field: fieldName,
              code: ValidationWarningCode.UNUSUAL_VALUE,
              message: `Field '${fieldName}' has unexpected key: ${key}`,
              value: obj[key],
              severity: ValidationSeverity.WARNING,
            });
          }
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * Apply a sanitizer to a value.
   */
  private applySanitizer(value: unknown, sanitizer: { name: string; type: SanitizerType | string }): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    switch (sanitizer.type) {
      case SanitizerType.TRIM:
        return value.trim();
      case SanitizerType.LOWERCASE:
        return value.toLowerCase();
      case SanitizerType.UPPERCASE:
        return value.toUpperCase();
      case SanitizerType.CAPITALIZE:
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
      case SanitizerType.ESCAPE_HTML:
        return value
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/"/g, '"')
          .replace(/'/g, '&apos;');
      case SanitizerType.NORMALIZE_WHITESPACE:
        return value.replace(/\s+/g, ' ').trim();
      case SanitizerType.REMOVE_NULL_BYTES:
        return value.replace(/\0/g, '');
      case SanitizerType.STRIP_TAGS:
        return value.replace(/<[^>]*>/g, '');
      default:
        return value;
    }
  }

  /**
   * Validate UUID format.
   */
  private isValidUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  /**
   * Validate email format.
   */
  private isValidEmail(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  /**
   * Validate URL format.
   */
  private isValidURL(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the number of times this strategy has been executed.
   *
   * @returns Execution count
   */
  getExecutionCount(): number {
    return this.executionCount;
  }
}
