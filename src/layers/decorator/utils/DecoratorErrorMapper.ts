import { DecoratorError } from './DecoratorError';

export interface MappedDecoratorError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class DecoratorErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | DecoratorError): MappedDecoratorError {
    if (error instanceof DecoratorError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected decorator error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | DecoratorError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
