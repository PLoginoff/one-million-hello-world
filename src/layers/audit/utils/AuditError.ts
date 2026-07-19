export class AuditError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'AuditError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Audit execution failed'): AuditError {
    return new AuditError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid audit configuration'): AuditError {
    return new AuditError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Audit resource not found'): AuditError {
    return new AuditError('NOT_FOUND', message, 404);
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
