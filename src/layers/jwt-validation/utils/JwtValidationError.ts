export class JwtValidationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'JwtValidationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'JwtValidation execution failed'): JwtValidationError {
    return new JwtValidationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid jwt-validation configuration'): JwtValidationError {
    return new JwtValidationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'JwtValidation resource not found'): JwtValidationError {
    return new JwtValidationError('NOT_FOUND', message, 404);
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
