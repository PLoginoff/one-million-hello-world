import { BlueGreenDeployError } from './BlueGreenDeployError';

export interface MappedBlueGreenDeployError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class BlueGreenDeployErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | BlueGreenDeployError): MappedBlueGreenDeployError {
    if (error instanceof BlueGreenDeployError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected blue-green-deploy error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | BlueGreenDeployError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
