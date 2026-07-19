export class EncryptionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'EncryptionError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Encryption execution failed'): EncryptionError {
    return new EncryptionError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid encryption configuration'): EncryptionError {
    return new EncryptionError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Encryption resource not found'): EncryptionError {
    return new EncryptionError('NOT_FOUND', message, 404);
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
