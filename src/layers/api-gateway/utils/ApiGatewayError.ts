export class ApiGatewayError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ApiGatewayError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'ApiGateway execution failed'): ApiGatewayError {
    return new ApiGatewayError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid api-gateway configuration'): ApiGatewayError {
    return new ApiGatewayError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'ApiGateway resource not found'): ApiGatewayError {
    return new ApiGatewayError('NOT_FOUND', message, 404);
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
