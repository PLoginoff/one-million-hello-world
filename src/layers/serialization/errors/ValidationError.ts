/**
 * Validation Error
 * 
 * Error thrown when validation fails.
 */

import { BaseSerializationError } from './BaseSerializationError';

export class ValidationError extends BaseSerializationError {
  constructor(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super('VALIDATION_ERROR', message, context, cause);
  }

  /**
   * Creates error for type mismatch
   */
  static typeMismatch(expected: string, actual: string): ValidationError {
    return new ValidationError(
      `Type mismatch: expected ${expected}, got ${actual}`,
      { expected, actual }
    );
  }

  /**
   * Creates error for schema validation failure
   */
  static schemaValidationFailed(errors: string[]): ValidationError {
    return new ValidationError(
      'Schema validation failed',
      { errors }
    );
  }

  /**
   * Creates error for required field missing
   */
  static requiredFieldMissing(field: string): ValidationError {
    return new ValidationError(
      `Required field '${field}' is missing`,
      { field }
    );
  }

  /**
   * Creates error for invalid value
   */
  static invalidValue(field: string, value: unknown, reason: string): ValidationError {
    return new ValidationError(
      `Invalid value for field '${field}': ${reason}`,
      { field, value, reason }
    );
  }

  /**
   * Creates error for constraint violation
   */
  static constraintViolation(constraint: string, details?: Record<string, unknown>): ValidationError {
    return new ValidationError(
      `Constraint violation: ${constraint}`,
      { constraint, ...details }
    );
  }
}
