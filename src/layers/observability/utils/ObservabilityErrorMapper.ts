import { ObservabilityError } from './ObservabilityError';

export interface MappedObservabilityError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class ObservabilityErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | ObservabilityError): MappedObservabilityError {
    if (error instanceof ObservabilityError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected observability error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | ObservabilityError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
