export class NetworkError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Network execution failed'): NetworkError {
    return new NetworkError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid network configuration'): NetworkError {
    return new NetworkError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Network resource not found'): NetworkError {
    return new NetworkError('NOT_FOUND', message, 404);
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
