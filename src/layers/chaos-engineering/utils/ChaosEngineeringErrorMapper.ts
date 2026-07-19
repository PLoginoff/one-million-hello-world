import { ChaosEngineeringError } from './ChaosEngineeringError';

export interface MappedChaosEngineeringError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class ChaosEngineeringErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | ChaosEngineeringError): MappedChaosEngineeringError {
    if (error instanceof ChaosEngineeringError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected chaos-engineering error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | ChaosEngineeringError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
