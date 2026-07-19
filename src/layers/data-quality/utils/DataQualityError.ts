export class DataQualityError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'DataQualityError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'DataQuality execution failed'): DataQualityError {
    return new DataQualityError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid data-quality configuration'): DataQualityError {
    return new DataQualityError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'DataQuality resource not found'): DataQualityError {
    return new DataQualityError('NOT_FOUND', message, 404);
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
