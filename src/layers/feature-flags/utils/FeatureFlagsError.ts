export class FeatureFlagsError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'FeatureFlagsError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'FeatureFlags execution failed'): FeatureFlagsError {
    return new FeatureFlagsError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid feature-flags configuration'): FeatureFlagsError {
    return new FeatureFlagsError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'FeatureFlags resource not found'): FeatureFlagsError {
    return new FeatureFlagsError('NOT_FOUND', message, 404);
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
