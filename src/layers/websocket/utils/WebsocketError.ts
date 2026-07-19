export class WebsocketError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'WebsocketError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Websocket execution failed'): WebsocketError {
    return new WebsocketError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid websocket configuration'): WebsocketError {
    return new WebsocketError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Websocket resource not found'): WebsocketError {
    return new WebsocketError('NOT_FOUND', message, 404);
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
