import { PropertyTestingError } from './PropertyTestingError';

export interface MappedPropertyTestingError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class PropertyTestingErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | PropertyTestingError): MappedPropertyTestingError {
    if (error instanceof PropertyTestingError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected property-testing error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | PropertyTestingError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
