export class DisasterRecoveryError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'DisasterRecoveryError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'DisasterRecovery execution failed'): DisasterRecoveryError {
    return new DisasterRecoveryError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid disaster-recovery configuration'): DisasterRecoveryError {
    return new DisasterRecoveryError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'DisasterRecovery resource not found'): DisasterRecoveryError {
    return new DisasterRecoveryError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
