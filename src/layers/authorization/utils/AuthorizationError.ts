export class AuthorizationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Authorization execution failed'): AuthorizationError {
    return new AuthorizationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid authorization configuration'): AuthorizationError {
    return new AuthorizationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Authorization resource not found'): AuthorizationError {
    return new AuthorizationError('NOT_FOUND', message, 404);
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
