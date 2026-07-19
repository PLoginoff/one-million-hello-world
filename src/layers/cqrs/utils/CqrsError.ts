export class CqrsError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'CqrsError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Cqrs execution failed'): CqrsError {
    return new CqrsError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid cqrs configuration'): CqrsError {
    return new CqrsError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Cqrs resource not found'): CqrsError {
    return new CqrsError('NOT_FOUND', message, 404);
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
