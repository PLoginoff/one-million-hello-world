import { HttpParserError } from './HttpParserError';

export interface MappedHttpParserError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class HttpParserErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | HttpParserError): MappedHttpParserError {
    if (error instanceof HttpParserError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected http-parser error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | HttpParserError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
