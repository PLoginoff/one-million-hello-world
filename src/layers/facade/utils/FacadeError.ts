export class FacadeError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'FacadeError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Facade execution failed'): FacadeError {
    return new FacadeError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid facade configuration'): FacadeError {
    return new FacadeError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Facade resource not found'): FacadeError {
    return new FacadeError('NOT_FOUND', message, 404);
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
