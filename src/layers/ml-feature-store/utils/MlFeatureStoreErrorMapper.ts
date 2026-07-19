import { MlFeatureStoreError } from './MlFeatureStoreError';

export interface MappedMlFeatureStoreError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class MlFeatureStoreErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | MlFeatureStoreError): MappedMlFeatureStoreError {
    if (error instanceof MlFeatureStoreError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected ml-feature-store error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | MlFeatureStoreError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
