import { ReadModelError } from './ReadModelError';

export interface MappedReadModelError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class ReadModelErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | ReadModelError): MappedReadModelError {
    if (error instanceof ReadModelError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected read-model error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | ReadModelError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
