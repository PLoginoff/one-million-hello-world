export class EventError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'EventError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Event execution failed'): EventError {
    return new EventError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid event configuration'): EventError {
    return new EventError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Event resource not found'): EventError {
    return new EventError('NOT_FOUND', message, 404);
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
