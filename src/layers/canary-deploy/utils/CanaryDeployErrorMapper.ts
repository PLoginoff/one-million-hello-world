import { CanaryDeployError } from './CanaryDeployError';

export interface MappedCanaryDeployError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class CanaryDeployErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | CanaryDeployError): MappedCanaryDeployError {
    if (error instanceof CanaryDeployError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected canary-deploy error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | CanaryDeployError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
