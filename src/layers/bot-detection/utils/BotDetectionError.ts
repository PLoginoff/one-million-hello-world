export class BotDetectionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'BotDetectionError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'BotDetection execution failed'): BotDetectionError {
    return new BotDetectionError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid bot-detection configuration'): BotDetectionError {
    return new BotDetectionError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'BotDetection resource not found'): BotDetectionError {
    return new BotDetectionError('NOT_FOUND', message, 404);
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
