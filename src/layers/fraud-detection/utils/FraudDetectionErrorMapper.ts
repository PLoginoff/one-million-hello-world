import { FraudDetectionError } from './FraudDetectionError';

export interface MappedFraudDetectionError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class FraudDetectionErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | FraudDetectionError): MappedFraudDetectionError {
    if (error instanceof FraudDetectionError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected fraud-detection error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | FraudDetectionError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
