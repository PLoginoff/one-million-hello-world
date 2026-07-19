export class LocalizationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'LocalizationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Localization execution failed'): LocalizationError {
    return new LocalizationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid localization configuration'): LocalizationError {
    return new LocalizationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Localization resource not found'): LocalizationError {
    return new LocalizationError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
