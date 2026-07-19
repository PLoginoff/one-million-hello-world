import { CostOptimizationError } from './CostOptimizationError';

export interface MappedCostOptimizationError {
  code: string;
  message: string;
  statusCode: number;
  retryable: boolean;
}

export class CostOptimizationErrorMapper {
  private static readonly _retryableCodes: Set<string> = new Set(['EXECUTION_FAILED', 'TIMEOUT']);

  static map(error: Error | CostOptimizationError): MappedCostOptimizationError {
    if (error instanceof CostOptimizationError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        retryable: this._retryableCodes.has(error.code),
      };
    }
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected cost-optimization error occurred',
      statusCode: 500,
      retryable: false,
    };
  }

  static isRetryable(error: Error | CostOptimizationError): boolean {
    return this.map(error).retryable;
  }
  static registerRetryableCode(code: string): void {
    this._retryableCodes.add(code);
  }
}
