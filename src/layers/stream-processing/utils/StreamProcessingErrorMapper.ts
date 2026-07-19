import { StreamProcessingError } from './StreamProcessingError';

export interface MappedStreamProcessingError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class StreamProcessingErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | StreamProcessingError): MappedStreamProcessingError {
    if (error instanceof StreamProcessingError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected stream-processing error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | StreamProcessingError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
