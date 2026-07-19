import { IdentityError } from './IdentityError';

export interface MappedIdentityError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class IdentityErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | IdentityError): MappedIdentityError {
    if (error instanceof IdentityError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected identity error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | IdentityError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
