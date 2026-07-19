import { DataLakeError } from './DataLakeError';

export interface MappedDataLakeError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class DataLakeErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | DataLakeError): MappedDataLakeError {
    if (error instanceof DataLakeError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected data-lake error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | DataLakeError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
