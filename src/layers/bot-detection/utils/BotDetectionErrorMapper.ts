import { BotDetectionError } from './BotDetectionError';

export interface MappedBotDetectionError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class BotDetectionErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | BotDetectionError): MappedBotDetectionError {
    if (error instanceof BotDetectionError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected bot-detection error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | BotDetectionError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
