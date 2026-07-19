import { MessageQueueError } from './MessageQueueError';

export interface MappedMessageQueueError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class MessageQueueErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | MessageQueueError): MappedMessageQueueError {
    if (error instanceof MessageQueueError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected message-queue error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | MessageQueueError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
