import { DataTransformationError } from './DataTransformationError';

export interface MappedDataTransformationError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class DataTransformationErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | DataTransformationError): MappedDataTransformationError {
    if (error instanceof DataTransformationError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected data-transformation error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | DataTransformationError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
