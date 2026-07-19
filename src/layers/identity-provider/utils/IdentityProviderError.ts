export class IdentityProviderError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'IdentityProviderError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'IdentityProvider execution failed'): IdentityProviderError {
    return new IdentityProviderError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid identity-provider configuration'): IdentityProviderError {
    return new IdentityProviderError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'IdentityProvider resource not found'): IdentityProviderError {
    return new IdentityProviderError('NOT_FOUND', message, 404);
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
