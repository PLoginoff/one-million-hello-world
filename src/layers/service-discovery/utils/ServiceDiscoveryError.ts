export class ServiceDiscoveryError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ServiceDiscoveryError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'ServiceDiscovery execution failed'): ServiceDiscoveryError {
    return new ServiceDiscoveryError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid service-discovery configuration'): ServiceDiscoveryError {
    return new ServiceDiscoveryError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'ServiceDiscovery resource not found'): ServiceDiscoveryError {
    return new ServiceDiscoveryError('NOT_FOUND', message, 404);
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
