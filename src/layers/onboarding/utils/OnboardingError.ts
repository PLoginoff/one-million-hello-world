export class OnboardingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'OnboardingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Onboarding execution failed'): OnboardingError {
    return new OnboardingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid onboarding configuration'): OnboardingError {
    return new OnboardingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Onboarding resource not found'): OnboardingError {
    return new OnboardingError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
