import { MfaError } from './MfaError';

export interface MappedMfaError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class MfaErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | MfaError): MappedMfaError {
    if (error instanceof MfaError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected mfa error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | MfaError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
