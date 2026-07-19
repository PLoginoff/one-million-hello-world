export class DeadLetterError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'DeadLetterError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'DeadLetter execution failed'): DeadLetterError {
    return new DeadLetterError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid dead-letter configuration'): DeadLetterError {
    return new DeadLetterError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'DeadLetter resource not found'): DeadLetterError {
    return new DeadLetterError('NOT_FOUND', message, 404);
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
