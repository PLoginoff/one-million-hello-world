export class DistributedTracingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'DistributedTracingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'DistributedTracing execution failed'): DistributedTracingError {
    return new DistributedTracingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid distributed-tracing configuration'): DistributedTracingError {
    return new DistributedTracingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'DistributedTracing resource not found'): DistributedTracingError {
    return new DistributedTracingError('NOT_FOUND', message, 404);
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
