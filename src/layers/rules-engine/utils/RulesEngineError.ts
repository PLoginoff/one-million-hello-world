export class RulesEngineError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'RulesEngineError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'RulesEngine execution failed'): RulesEngineError {
    return new RulesEngineError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid rules-engine configuration'): RulesEngineError {
    return new RulesEngineError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'RulesEngine resource not found'): RulesEngineError {
    return new RulesEngineError('NOT_FOUND', message, 404);
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
