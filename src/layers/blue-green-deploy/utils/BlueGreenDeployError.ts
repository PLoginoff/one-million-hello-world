export class BlueGreenDeployError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'BlueGreenDeployError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'BlueGreenDeploy execution failed'): BlueGreenDeployError {
    return new BlueGreenDeployError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid blue-green-deploy configuration'): BlueGreenDeployError {
    return new BlueGreenDeployError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'BlueGreenDeploy resource not found'): BlueGreenDeployError {
    return new BlueGreenDeployError('NOT_FOUND', message, 404);
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
