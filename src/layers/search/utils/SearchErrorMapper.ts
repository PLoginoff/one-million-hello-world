import { SearchError } from './SearchError';

export interface MappedSearchError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class SearchErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | SearchError): MappedSearchError {
    if (error instanceof SearchError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected search error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | SearchError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
