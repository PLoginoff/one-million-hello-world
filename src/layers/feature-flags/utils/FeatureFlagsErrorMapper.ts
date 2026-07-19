import { FeatureFlagsError } from './FeatureFlagsError';

export interface MappedFeatureFlagsError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class FeatureFlagsErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | FeatureFlagsError): MappedFeatureFlagsError {
    if (error instanceof FeatureFlagsError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected feature-flags error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | FeatureFlagsError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
