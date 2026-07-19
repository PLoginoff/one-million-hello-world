import { DdosProtectionError } from './DdosProtectionError';

export interface MappedDdosProtectionError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class DdosProtectionErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | DdosProtectionError): MappedDdosProtectionError {
    if (error instanceof DdosProtectionError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected ddos-protection error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | DdosProtectionError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
