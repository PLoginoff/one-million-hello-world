import { UnitOfWorkError } from './UnitOfWorkError';

export interface MappedUnitOfWorkError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class UnitOfWorkErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | UnitOfWorkError): MappedUnitOfWorkError {
    if (error instanceof UnitOfWorkError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected unit-of-work error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | UnitOfWorkError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
