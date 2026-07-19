import { OutboxError } from './OutboxError';

export interface MappedOutboxError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class OutboxErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | OutboxError): MappedOutboxError {
    if (error instanceof OutboxError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected outbox error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | OutboxError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
