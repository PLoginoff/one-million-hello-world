import { AnalyticsError } from './AnalyticsError';

export interface MappedAnalyticsError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class AnalyticsErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | AnalyticsError): MappedAnalyticsError {
    if (error instanceof AnalyticsError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected analytics error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | AnalyticsError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
