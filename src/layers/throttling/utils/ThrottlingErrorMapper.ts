import { ThrottlingError } from './ThrottlingError';

export interface MappedThrottlingError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class ThrottlingErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | ThrottlingError): MappedThrottlingError {
    if (error instanceof ThrottlingError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected throttling error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | ThrottlingError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
