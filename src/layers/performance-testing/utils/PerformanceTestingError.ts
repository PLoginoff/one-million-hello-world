export class PerformanceTestingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'PerformanceTestingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'PerformanceTesting execution failed'): PerformanceTestingError {
    return new PerformanceTestingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid performance-testing configuration'): PerformanceTestingError {
    return new PerformanceTestingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'PerformanceTesting resource not found'): PerformanceTestingError {
    return new PerformanceTestingError('NOT_FOUND', message, 404);
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
