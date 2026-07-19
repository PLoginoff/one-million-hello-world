export class SnapshotError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'SnapshotError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Snapshot execution failed'): SnapshotError {
    return new SnapshotError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid snapshot configuration'): SnapshotError {
    return new SnapshotError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Snapshot resource not found'): SnapshotError {
    return new SnapshotError('NOT_FOUND', message, 404);
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
