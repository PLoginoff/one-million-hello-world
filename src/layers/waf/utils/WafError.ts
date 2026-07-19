export class WafError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'WafError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Waf execution failed'): WafError {
    return new WafError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid waf configuration'): WafError {
    return new WafError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Waf resource not found'): WafError {
    return new WafError('NOT_FOUND', message, 404);
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
