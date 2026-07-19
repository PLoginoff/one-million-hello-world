export class HttpParserError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'HttpParserError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'HttpParser execution failed'): HttpParserError {
    return new HttpParserError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid http-parser configuration'): HttpParserError {
    return new HttpParserError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'HttpParser resource not found'): HttpParserError {
    return new HttpParserError('NOT_FOUND', message, 404);
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
