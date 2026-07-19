export class SecretsRotationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'SecretsRotationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'SecretsRotation execution failed'): SecretsRotationError {
    return new SecretsRotationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid secrets-rotation configuration'): SecretsRotationError {
    return new SecretsRotationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'SecretsRotation resource not found'): SecretsRotationError {
    return new SecretsRotationError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
