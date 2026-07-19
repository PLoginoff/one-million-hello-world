export class ContractTestingError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ContractTestingError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'ContractTesting execution failed'): ContractTestingError {
    return new ContractTestingError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid contract-testing configuration'): ContractTestingError {
    return new ContractTestingError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'ContractTesting resource not found'): ContractTestingError {
    return new ContractTestingError('NOT_FOUND', message, 404);
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
