/**
 * Controller Error
 * 
 * Custom error class for controller errors.
 */

export class ControllerError extends Error {
  readonly code: string;
  readonly controllerId?: string;

  constructor(code: string, message: string, controllerId?: string) {
    super(message);
    this.name = 'ControllerError';
    this.code = code;
    this.controllerId = controllerId;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create controller not found error
   */
  static notFound(message: string = 'Controller not found', controllerId?: string): ControllerError {
    return new ControllerError('CONTROLLER_NOT_FOUND', message, controllerId);
  }

  /**
   * Create controller already registered error
   */
  static alreadyRegistered(message: string = 'Controller already registered', controllerId?: string): ControllerError {
    return new ControllerError('CONTROLLER_ALREADY_REGISTERED', message, controllerId);
  }

  /**
   * Create controller instantiation error
   */
  static instantiationFailed(message: string = 'Controller instantiation failed', controllerId?: string): ControllerError {
    return new ControllerError('CONTROLLER_INSTANTIATION_FAILED', message, controllerId);
  }

  /**
   * Convert to plain object
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    controllerId?: string;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      controllerId: this.controllerId,
      stack: this.stack,
    };
  }
}
