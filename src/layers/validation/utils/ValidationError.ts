/**
 * Validation Error
 * 
 * Custom error class for validation errors.
 */

export class ValidationError extends Error {
  readonly code: string;
  readonly field?: string;
  readonly severity: 'info' | 'warning' | 'error' | 'critical';

  constructor(code: string, message: string, field?: string, severity: 'info' | 'warning' | 'error' | 'critical' = 'error') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.field = field;
    this.severity = severity;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create required field error
   */
  static required(field: string): ValidationError {
    return new ValidationError('REQUIRED_FIELD', `${field} is required`, field, 'error');
  }

  /**
   * Create invalid format error
   */
  static invalidFormat(field: string, expectedFormat: string): ValidationError {
    return new ValidationError('INVALID_FORMAT', `${field} must be ${expectedFormat}`, field, 'error');
  }

  /**
   * Create out of range error
   */
  static outOfRange(field: string, min?: number, max?: number): ValidationError {
    let message = `${field}`;
    if (min !== undefined && max !== undefined) {
      message += ` must be between ${min} and ${max}`;
    } else if (min !== undefined) {
      message += ` must be at least ${min}`;
    } else if (max !== undefined) {
      message += ` must not exceed ${max}`;
    }
    return new ValidationError('OUT_OF_RANGE', message, field, 'error');
  }

  /**
   * Create pattern mismatch error
   */
  static patternMismatch(field: string, pattern: string): ValidationError {
    return new ValidationError('PATTERN_MISMATCH', `${field} does not match required pattern`, field, 'error');
  }

  /**
   * Create type mismatch error
   */
  static typeMismatch(field: string, expectedType: string): ValidationError {
    return new ValidationError('TYPE_MISMATCH', `${field} must be of type ${expectedType}`, field, 'error');
  }

  /**
   * Convert to plain object
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    field?: string;
    severity: string;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      field: this.field,
      severity: this.severity,
      stack: this.stack,
    };
  }
}
