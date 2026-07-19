/**
 * Validation Error Mapper
 */

import { ValidationError } from './ValidationError';

export interface MappedValidationError {
  code: string;
  message: string;
  field?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  httpStatus: number;
}

export class ValidationErrorMapper {
  private static readonly _severityToStatus: Record<string, number> = {
    info: 200,
    warning: 200,
    error: 400,
    critical: 422,
  };

  static map(error: Error | ValidationError): MappedValidationError {
    if (error instanceof ValidationError) {
      return {
        code: error.code,
        message: error.message,
        field: error.field,
        severity: error.severity,
        httpStatus: this._severityToStatus[error.severity] ?? 400,
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected validation error occurred',
      severity: 'error',
      httpStatus: 500,
    };
  }

  static registerSeverityMapping(severity: string, httpStatus: number): void {
    this._severityToStatus[severity] = httpStatus;
  }
}
