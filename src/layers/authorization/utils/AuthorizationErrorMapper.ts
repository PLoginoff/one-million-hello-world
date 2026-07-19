import { AuthorizationError } from './AuthorizationError';

export interface MappedAuthorizationError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class AuthorizationErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | AuthorizationError): MappedAuthorizationError {
    if (error instanceof AuthorizationError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected authorization error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | AuthorizationError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
