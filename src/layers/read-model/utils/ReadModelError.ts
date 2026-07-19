export class ReadModelError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ReadModelError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'ReadModel execution failed'): ReadModelError {
    return new ReadModelError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid read-model configuration'): ReadModelError {
    return new ReadModelError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'ReadModel resource not found'): ReadModelError {
    return new ReadModelError('NOT_FOUND', message, 404);
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
