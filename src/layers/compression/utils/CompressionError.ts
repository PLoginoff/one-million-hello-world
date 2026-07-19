export class CompressionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'CompressionError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Compression execution failed'): CompressionError {
    return new CompressionError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid compression configuration'): CompressionError {
    return new CompressionError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Compression resource not found'): CompressionError {
    return new CompressionError('NOT_FOUND', message, 404);
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
