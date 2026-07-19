export class SiemError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'SiemError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Siem execution failed'): SiemError {
    return new SiemError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid siem configuration'): SiemError {
    return new SiemError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Siem resource not found'): SiemError {
    return new SiemError('NOT_FOUND', message, 404);
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
