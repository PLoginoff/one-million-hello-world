export class CdnIntegrationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'CdnIntegrationError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'CdnIntegration execution failed'): CdnIntegrationError {
    return new CdnIntegrationError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid cdn-integration configuration'): CdnIntegrationError {
    return new CdnIntegrationError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'CdnIntegration resource not found'): CdnIntegrationError {
    return new CdnIntegrationError('NOT_FOUND', message, 404);
  }

  toJSON(): { name: string; code: string; message: string; statusCode: number; stack?: string } {
    return { name: this.name, code: this.code, message: this.message, statusCode: this.statusCode, stack: this.stack };
  }
}
