export class EdgeCacheError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'EdgeCacheError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'EdgeCache execution failed'): EdgeCacheError {
    return new EdgeCacheError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid edge-cache configuration'): EdgeCacheError {
    return new EdgeCacheError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'EdgeCache resource not found'): EdgeCacheError {
    return new EdgeCacheError('NOT_FOUND', message, 404);
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
