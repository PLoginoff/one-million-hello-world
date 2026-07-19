export class ObservabilityError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ObservabilityError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Observability execution failed'): ObservabilityError {
    return new ObservabilityError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid observability configuration'): ObservabilityError {
    return new ObservabilityError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Observability resource not found'): ObservabilityError {
    return new ObservabilityError('NOT_FOUND', message, 404);
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
