import { PerformanceTestingError } from './PerformanceTestingError';

export interface MappedPerformanceTestingError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class PerformanceTestingErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | PerformanceTestingError): MappedPerformanceTestingError {
    if (error instanceof PerformanceTestingError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected performance-testing error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | PerformanceTestingError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
