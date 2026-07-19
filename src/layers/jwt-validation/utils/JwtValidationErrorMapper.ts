import { JwtValidationError } from './JwtValidationError';

export interface MappedJwtValidationError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class JwtValidationErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | JwtValidationError): MappedJwtValidationError {
    if (error instanceof JwtValidationError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected jwt-validation error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | JwtValidationError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
