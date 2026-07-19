import { WafError } from './WafError';

export interface MappedWafError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class WafErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | WafError): MappedWafError {
    if (error instanceof WafError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected waf error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | WafError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
