export class InboxError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'InboxError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Inbox execution failed'): InboxError {
    return new InboxError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid inbox configuration'): InboxError {
    return new InboxError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Inbox resource not found'): InboxError {
    return new InboxError('NOT_FOUND', message, 404);
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
