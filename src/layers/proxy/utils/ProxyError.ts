export class ProxyError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ProxyError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Proxy execution failed'): ProxyError {
    return new ProxyError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid proxy configuration'): ProxyError {
    return new ProxyError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Proxy resource not found'): ProxyError {
    return new ProxyError('NOT_FOUND', message, 404);
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
