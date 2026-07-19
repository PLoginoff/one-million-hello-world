export class CostOptimizationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'CostOptimizationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'CostOptimization execution failed'): CostOptimizationError {
    return new CostOptimizationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid cost-optimization configuration'): CostOptimizationError {
    return new CostOptimizationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'CostOptimization resource not found'): CostOptimizationError {
    return new CostOptimizationError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
