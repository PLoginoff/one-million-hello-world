export class TransportError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'TransportError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Transport execution failed'): TransportError {
    return new TransportError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid transport configuration'): TransportError {
    return new TransportError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Transport resource not found'): TransportError {
    return new TransportError('NOT_FOUND', message, 404);
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
