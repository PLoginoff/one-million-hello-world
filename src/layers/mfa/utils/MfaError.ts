export class MfaError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'MfaError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Mfa execution failed'): MfaError {
    return new MfaError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid mfa configuration'): MfaError {
    return new MfaError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Mfa resource not found'): MfaError {
    return new MfaError('NOT_FOUND', message, 404);
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
