export class MigrationsError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'MigrationsError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Migrations execution failed'): MigrationsError {
    return new MigrationsError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid migrations configuration'): MigrationsError {
    return new MigrationsError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Migrations resource not found'): MigrationsError {
    return new MigrationsError('NOT_FOUND', message, 404);
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
