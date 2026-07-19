import { EdgeCacheError } from './EdgeCacheError';

export interface MappedEdgeCacheError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class EdgeCacheErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | EdgeCacheError): MappedEdgeCacheError {
    if (error instanceof EdgeCacheError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected edge-cache error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | EdgeCacheError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
