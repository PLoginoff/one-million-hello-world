import { FacadeError } from './FacadeError';

export interface MappedFacadeError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class FacadeErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | FacadeError): MappedFacadeError {
    if (error instanceof FacadeError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected facade error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | FacadeError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
