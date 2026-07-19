export class PropertyTestingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'PropertyTestingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'PropertyTesting execution failed'): PropertyTestingError {
    return new PropertyTestingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid property-testing configuration'): PropertyTestingError {
    return new PropertyTestingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'PropertyTesting resource not found'): PropertyTestingError {
    return new PropertyTestingError('NOT_FOUND', message, 404);
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
