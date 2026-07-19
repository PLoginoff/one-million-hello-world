import { DisasterRecoveryError } from './DisasterRecoveryError';

export interface MappedDisasterRecoveryError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class DisasterRecoveryErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | DisasterRecoveryError): MappedDisasterRecoveryError {
    if (error instanceof DisasterRecoveryError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected disaster-recovery error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | DisasterRecoveryError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
