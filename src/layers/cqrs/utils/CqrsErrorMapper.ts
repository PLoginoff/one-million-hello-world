import { CqrsError } from './CqrsError';

export interface MappedCqrsError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class CqrsErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | CqrsError): MappedCqrsError {
    if (error instanceof CqrsError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected cqrs error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | CqrsError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
