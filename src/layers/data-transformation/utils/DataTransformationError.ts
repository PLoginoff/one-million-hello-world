export class DataTransformationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'DataTransformationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'DataTransformation execution failed'): DataTransformationError {
    return new DataTransformationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid data-transformation configuration'): DataTransformationError {
    return new DataTransformationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'DataTransformation resource not found'): DataTransformationError {
    return new DataTransformationError('NOT_FOUND', message, 404);
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
