import { DistributedTracingError } from './DistributedTracingError';

export interface MappedDistributedTracingError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class DistributedTracingErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | DistributedTracingError): MappedDistributedTracingError {
    if (error instanceof DistributedTracingError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected distributed-tracing error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | DistributedTracingError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
