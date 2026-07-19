import { LocalizationError } from './LocalizationError';

export interface MappedLocalizationError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class LocalizationErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | LocalizationError): MappedLocalizationError {
    if (error instanceof LocalizationError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected localization error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | LocalizationError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
