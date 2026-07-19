import { RecommendationError } from './RecommendationError';

export interface MappedRecommendationError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class RecommendationErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | RecommendationError): MappedRecommendationError {
    if (error instanceof RecommendationError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected recommendation error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | RecommendationError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
