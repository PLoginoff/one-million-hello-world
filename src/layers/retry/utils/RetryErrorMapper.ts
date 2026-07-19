import { RetryError } from './RetryError';

export interface MappedRetryError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class RetryErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | RetryError): MappedRetryError {
    if (error instanceof RetryError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected retry error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | RetryError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
