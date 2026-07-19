export class MessageBusError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'MessageBusError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'MessageBus execution failed'): MessageBusError {
    return new MessageBusError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid message-bus configuration'): MessageBusError {
    return new MessageBusError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'MessageBus resource not found'): MessageBusError {
    return new MessageBusError('NOT_FOUND', message, 404);
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
