export class ConfigurationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Configuration execution failed'): ConfigurationError {
    return new ConfigurationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid configuration configuration'): ConfigurationError {
    return new ConfigurationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Configuration resource not found'): ConfigurationError {
    return new ConfigurationError('NOT_FOUND', message, 404);
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
