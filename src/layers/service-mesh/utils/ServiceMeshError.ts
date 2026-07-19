export class ServiceMeshError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ServiceMeshError';
    this.code = code;
    this.statusCode = statusCode;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static executionFailed(message: string = 'ServiceMesh execution failed'): ServiceMeshError {
    return new ServiceMeshError('EXECUTION_FAILED', message, 500);
  }

  static configurationError(message: string = 'Invalid service-mesh configuration'): ServiceMeshError {
    return new ServiceMeshError('CONFIGURATION_ERROR', message, 400);
  }

  static notFound(message: string = 'ServiceMesh resource not found'): ServiceMeshError {
    return new ServiceMeshError('NOT_FOUND', message, 404);
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
