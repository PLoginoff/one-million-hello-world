import { NotificationError } from './NotificationError';

export interface MappedNotificationError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class NotificationErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | NotificationError): MappedNotificationError {
    if (error instanceof NotificationError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected notification error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | NotificationError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
