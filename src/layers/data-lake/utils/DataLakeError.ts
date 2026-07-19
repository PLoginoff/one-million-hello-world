export class DataLakeError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'DataLakeError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'DataLake execution failed'): DataLakeError {
    return new DataLakeError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid data-lake configuration'): DataLakeError {
    return new DataLakeError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'DataLake resource not found'): DataLakeError {
    return new DataLakeError('NOT_FOUND', message, 404);
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
