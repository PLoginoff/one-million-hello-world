export class CanaryDeployError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'CanaryDeployError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'CanaryDeploy execution failed'): CanaryDeployError {
    return new CanaryDeployError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid canary-deploy configuration'): CanaryDeployError {
    return new CanaryDeployError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'CanaryDeploy resource not found'): CanaryDeployError {
    return new CanaryDeployError('NOT_FOUND', message, 404);
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
