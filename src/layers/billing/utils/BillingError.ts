export class BillingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Billing execution failed'): BillingError {
    return new BillingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid billing configuration'): BillingError {
    return new BillingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Billing resource not found'): BillingError {
    return new BillingError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
