import { SpecificationError } from './SpecificationError';

export interface MappedSpecificationError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class SpecificationErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | SpecificationError): MappedSpecificationError {
    if (error instanceof SpecificationError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected specification error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | SpecificationError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
