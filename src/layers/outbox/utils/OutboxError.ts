export class OutboxError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'OutboxError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Outbox execution failed'): OutboxError {
    return new OutboxError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid outbox configuration'): OutboxError {
    return new OutboxError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Outbox resource not found'): OutboxError {
    return new OutboxError('NOT_FOUND', message, 404);
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
