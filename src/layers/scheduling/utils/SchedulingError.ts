export class SchedulingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'SchedulingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Scheduling execution failed'): SchedulingError {
    return new SchedulingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid scheduling configuration'): SchedulingError {
    return new SchedulingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Scheduling resource not found'): SchedulingError {
    return new SchedulingError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
