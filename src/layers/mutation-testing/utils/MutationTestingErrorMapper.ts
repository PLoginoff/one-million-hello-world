import { MutationTestingError } from './MutationTestingError';

export interface MappedMutationTestingError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class MutationTestingErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | MutationTestingError): MappedMutationTestingError {
    if (error instanceof MutationTestingError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected mutation-testing error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | MutationTestingError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
