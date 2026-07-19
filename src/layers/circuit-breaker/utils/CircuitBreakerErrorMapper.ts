import { CircuitBreakerError } from './CircuitBreakerError';

export interface MappedCircuitBreakerError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class CircuitBreakerErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | CircuitBreakerError): MappedCircuitBreakerError {
    if (error instanceof CircuitBreakerError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected circuit-breaker error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | CircuitBreakerError): boolean {
    return this.map(error).retryable;
  }

  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
