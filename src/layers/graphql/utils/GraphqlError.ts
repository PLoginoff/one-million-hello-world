export class GraphqlError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'GraphqlError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Graphql execution failed'): GraphqlError {
    return new GraphqlError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid graphql configuration'): GraphqlError {
    return new GraphqlError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Graphql resource not found'): GraphqlError {
    return new GraphqlError('NOT_FOUND', message, 404);
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
