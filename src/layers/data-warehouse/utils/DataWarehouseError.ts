export class DataWarehouseError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'DataWarehouseError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'DataWarehouse execution failed'): DataWarehouseError {
    return new DataWarehouseError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid data-warehouse configuration'): DataWarehouseError {
    return new DataWarehouseError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'DataWarehouse resource not found'): DataWarehouseError {
    return new DataWarehouseError('NOT_FOUND', message, 404);
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
