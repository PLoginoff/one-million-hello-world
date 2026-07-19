import { DeadLetterError } from './DeadLetterError';

export interface MappedDeadLetterError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class DeadLetterErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | DeadLetterError): MappedDeadLetterError {
    if (error instanceof DeadLetterError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected dead-letter error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | DeadLetterError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
