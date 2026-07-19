import { EventSourcingError } from './EventSourcingError';

export interface MappedEventSourcingError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class EventSourcingErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | EventSourcingError): MappedEventSourcingError {
    if (error instanceof EventSourcingError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected event-sourcing error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | EventSourcingError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
