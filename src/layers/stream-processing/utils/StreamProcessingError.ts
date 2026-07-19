export class StreamProcessingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'StreamProcessingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'StreamProcessing execution failed'): StreamProcessingError {
    return new StreamProcessingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid stream-processing configuration'): StreamProcessingError {
    return new StreamProcessingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'StreamProcessing resource not found'): StreamProcessingError {
    return new StreamProcessingError('NOT_FOUND', message, 404);
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
