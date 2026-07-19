export class SchemaRegistryError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'SchemaRegistryError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'SchemaRegistry execution failed'): SchemaRegistryError {
    return new SchemaRegistryError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid schema-registry configuration'): SchemaRegistryError {
    return new SchemaRegistryError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'SchemaRegistry resource not found'): SchemaRegistryError {
    return new SchemaRegistryError('NOT_FOUND', message, 404);
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
