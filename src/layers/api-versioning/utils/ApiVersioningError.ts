export class ApiVersioningError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ApiVersioningError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'ApiVersioning execution failed'): ApiVersioningError {
    return new ApiVersioningError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid api-versioning configuration'): ApiVersioningError {
    return new ApiVersioningError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'ApiVersioning resource not found'): ApiVersioningError {
    return new ApiVersioningError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
