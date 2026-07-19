export class MutationTestingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'MutationTestingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'MutationTesting execution failed'): MutationTestingError {
    return new MutationTestingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid mutation-testing configuration'): MutationTestingError {
    return new MutationTestingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'MutationTesting resource not found'): MutationTestingError {
    return new MutationTestingError('NOT_FOUND', message, 404);
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
