import { BillingError } from './BillingError';

export interface MappedBillingError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class BillingErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | BillingError): MappedBillingError {
    if (error instanceof BillingError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected billing error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | BillingError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
