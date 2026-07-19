export class SerializationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'SerializationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Serialization execution failed'): SerializationError {
    return new SerializationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid serialization configuration'): SerializationError {
    return new SerializationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Serialization resource not found'): SerializationError {
    return new SerializationError('NOT_FOUND', message, 404);
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
