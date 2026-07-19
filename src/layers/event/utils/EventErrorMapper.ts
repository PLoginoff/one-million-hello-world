import { EventError } from './EventError';

export interface MappedEventError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class EventErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | EventError): MappedEventError {
    if (error instanceof EventError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected event error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | EventError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
