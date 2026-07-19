export class StrategyError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'StrategyError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Strategy execution failed'): StrategyError {
    return new StrategyError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid strategy configuration'): StrategyError {
    return new StrategyError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Strategy resource not found'): StrategyError {
    return new StrategyError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      stack: this.stack,
    };
  }
}
