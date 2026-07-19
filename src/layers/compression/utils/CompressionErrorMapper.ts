import { CompressionError } from './CompressionError';

export interface MappedCompressionError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class CompressionErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | CompressionError): MappedCompressionError {
    if (error instanceof CompressionError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected compression error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | CompressionError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
