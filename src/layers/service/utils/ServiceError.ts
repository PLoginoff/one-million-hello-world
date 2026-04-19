/**
 * Service Error
 * 
 * Custom error class for service errors.
 */

export class ServiceError extends Error {
  readonly code: string;
  readonly serviceId?: string;

  constructor(code: string, message: string, serviceId?: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.serviceId = serviceId;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create service not found error
   */
  static notFound(message: string = 'Service not found', serviceId?: string): ServiceError {
    return new ServiceError('SERVICE_NOT_FOUND', message, serviceId);
  }

  /**
   * Create service already registered error
   */
  static alreadyRegistered(message: string = 'Service already registered', serviceId?: string): ServiceError {
    return new ServiceError('SERVICE_ALREADY_REGISTERED', message, serviceId);
  }

  /**
   * Create service execution error
   */
  static executionFailed(message: string = 'Service execution failed', serviceId?: string): ServiceError {
    return new ServiceError('SERVICE_EXECUTION_FAILED', message, serviceId);
  }

  /**
   * Convert to plain object
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    serviceId?: string;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      serviceId: this.serviceId,
      stack: this.stack,
    };
  }
}
