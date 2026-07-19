export class ThrottlingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ThrottlingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Throttling execution failed'): ThrottlingError {
    return new ThrottlingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid throttling configuration'): ThrottlingError {
    return new ThrottlingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Throttling resource not found'): ThrottlingError {
    return new ThrottlingError('NOT_FOUND', message, 404);
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
