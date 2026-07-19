export class GovernanceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'GovernanceError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Governance execution failed'): GovernanceError {
    return new GovernanceError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid governance configuration'): GovernanceError {
    return new GovernanceError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Governance resource not found'): GovernanceError {
    return new GovernanceError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
