export class QueryObjectError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'QueryObjectError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'QueryObject execution failed'): QueryObjectError {
    return new QueryObjectError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid query-object configuration'): QueryObjectError {
    return new QueryObjectError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'QueryObject resource not found'): QueryObjectError {
    return new QueryObjectError('NOT_FOUND', message, 404);
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
