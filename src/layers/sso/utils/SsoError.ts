export class SsoError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'SsoError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Sso execution failed'): SsoError {
    return new SsoError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid sso configuration'): SsoError {
    return new SsoError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Sso resource not found'): SsoError {
    return new SsoError('NOT_FOUND', message, 404);
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
