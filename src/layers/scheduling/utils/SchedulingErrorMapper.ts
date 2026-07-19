import { SchedulingError } from './SchedulingError';

export interface MappedSchedulingError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class SchedulingErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | SchedulingError): MappedSchedulingError {
    if (error instanceof SchedulingError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected scheduling error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | SchedulingError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
