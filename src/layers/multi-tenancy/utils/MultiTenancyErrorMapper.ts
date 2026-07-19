import { MultiTenancyError } from './MultiTenancyError';

export interface MappedMultiTenancyError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class MultiTenancyErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | MultiTenancyError): MappedMultiTenancyError {
    if (error instanceof MultiTenancyError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected multi-tenancy error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | MultiTenancyError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
