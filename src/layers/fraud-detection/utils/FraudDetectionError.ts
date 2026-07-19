export class FraudDetectionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'FraudDetectionError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'FraudDetection execution failed'): FraudDetectionError {
    return new FraudDetectionError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid fraud-detection configuration'): FraudDetectionError {
    return new FraudDetectionError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'FraudDetection resource not found'): FraudDetectionError {
    return new FraudDetectionError('NOT_FOUND', message, 404);
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
