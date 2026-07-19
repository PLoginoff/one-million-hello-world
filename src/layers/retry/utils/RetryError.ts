export class RetryError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'RetryError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Retry execution failed'): RetryError {
    return new RetryError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid retry configuration'): RetryError {
    return new RetryError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Retry resource not found'): RetryError {
    return new RetryError('NOT_FOUND', message, 404);
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
