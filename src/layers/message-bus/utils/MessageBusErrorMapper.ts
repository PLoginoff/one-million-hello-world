import { MessageBusError } from './MessageBusError';

export interface MappedMessageBusError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class MessageBusErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | MessageBusError): MappedMessageBusError {
    if (error instanceof MessageBusError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected message-bus error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | MessageBusError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
