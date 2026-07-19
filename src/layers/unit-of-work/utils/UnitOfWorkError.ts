export class UnitOfWorkError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'UnitOfWorkError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'UnitOfWork execution failed'): UnitOfWorkError {
    return new UnitOfWorkError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid unit-of-work configuration'): UnitOfWorkError {
    return new UnitOfWorkError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'UnitOfWork resource not found'): UnitOfWorkError {
    return new UnitOfWorkError('NOT_FOUND', message, 404);
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
