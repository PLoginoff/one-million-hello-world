export class DdosProtectionError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'DdosProtectionError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'DdosProtection execution failed'): DdosProtectionError {
    return new DdosProtectionError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid ddos-protection configuration'): DdosProtectionError {
    return new DdosProtectionError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'DdosProtection resource not found'): DdosProtectionError {
    return new DdosProtectionError('NOT_FOUND', message, 404);
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
