export class NotificationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'NotificationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Notification execution failed'): NotificationError {
    return new NotificationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid notification configuration'): NotificationError {
    return new NotificationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Notification resource not found'): NotificationError {
    return new NotificationError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
