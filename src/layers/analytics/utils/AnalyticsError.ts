export class AnalyticsError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'AnalyticsError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Analytics execution failed'): AnalyticsError {
    return new AnalyticsError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid analytics configuration'): AnalyticsError {
    return new AnalyticsError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Analytics resource not found'): AnalyticsError {
    return new AnalyticsError('NOT_FOUND', message, 404);
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
