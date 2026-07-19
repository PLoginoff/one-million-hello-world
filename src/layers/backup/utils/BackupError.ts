export class BackupError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Backup execution failed'): BackupError {
    return new BackupError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid backup configuration'): BackupError {
    return new BackupError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Backup resource not found'): BackupError {
    return new BackupError('NOT_FOUND', message, 404);
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
