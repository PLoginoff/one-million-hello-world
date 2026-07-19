export class AnomalyDetectionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'AnomalyDetectionError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'AnomalyDetection execution failed'): AnomalyDetectionError {
    return new AnomalyDetectionError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid anomaly-detection configuration'): AnomalyDetectionError {
    return new AnomalyDetectionError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'AnomalyDetection resource not found'): AnomalyDetectionError {
    return new AnomalyDetectionError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
