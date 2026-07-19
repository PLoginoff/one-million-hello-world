export class WriteModelError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'WriteModelError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'WriteModel execution failed'): WriteModelError {
    return new WriteModelError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid write-model configuration'): WriteModelError {
    return new WriteModelError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'WriteModel resource not found'): WriteModelError {
    return new WriteModelError('NOT_FOUND', message, 404);
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
