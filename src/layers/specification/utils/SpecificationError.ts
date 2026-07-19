export class SpecificationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'SpecificationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Specification execution failed'): SpecificationError {
    return new SpecificationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid specification configuration'): SpecificationError {
    return new SpecificationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Specification resource not found'): SpecificationError {
    return new SpecificationError('NOT_FOUND', message, 404);
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
