export class Oauth2Error extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'Oauth2Error';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'Oauth2 execution failed'): Oauth2Error {
    return new Oauth2Error('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid oauth2 configuration'): Oauth2Error {
    return new Oauth2Error('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'Oauth2 resource not found'): Oauth2Error {
    return new Oauth2Error('NOT_FOUND', message, 404);
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
