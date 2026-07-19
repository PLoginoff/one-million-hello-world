export class MessageQueueError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'MessageQueueError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'MessageQueue execution failed'): MessageQueueError {
    return new MessageQueueError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid message-queue configuration'): MessageQueueError {
    return new MessageQueueError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'MessageQueue resource not found'): MessageQueueError {
    return new MessageQueueError('NOT_FOUND', message, 404);
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
