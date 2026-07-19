export class SagaError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'SagaError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Saga execution failed'): SagaError {
    return new SagaError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid saga configuration'): SagaError {
    return new SagaError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Saga resource not found'): SagaError {
    return new SagaError('NOT_FOUND', message, 404);
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
