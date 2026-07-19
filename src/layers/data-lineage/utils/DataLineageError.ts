export class DataLineageError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'DataLineageError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'DataLineage execution failed'): DataLineageError {
    return new DataLineageError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid data-lineage configuration'): DataLineageError {
    return new DataLineageError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'DataLineage resource not found'): DataLineageError {
    return new DataLineageError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
