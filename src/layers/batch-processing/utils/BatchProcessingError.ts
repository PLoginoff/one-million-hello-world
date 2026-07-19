export class BatchProcessingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'BatchProcessingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'BatchProcessing execution failed'): BatchProcessingError {
    return new BatchProcessingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid batch-processing configuration'): BatchProcessingError {
    return new BatchProcessingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'BatchProcessing resource not found'): BatchProcessingError {
    return new BatchProcessingError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
