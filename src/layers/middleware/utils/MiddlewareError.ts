/**
 * Middleware Error
 * 
 * Custom error class for middleware errors.
 */

export class MiddlewareError extends Error {
  readonly code: string;
  readonly middlewareId?: string;
  readonly originalError?: Error;

  constructor(code: string, message: string, middlewareId?: string, originalError?: Error) {
    super(message);
    this.name = 'MiddlewareError';
    this.code = code;
    this.middlewareId = middlewareId;
    this.originalError = originalError;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create execution error
   */
  static executionFailed(message: string = 'Middleware execution failed', middlewareId?: string, originalError?: Error): MiddlewareError {
    return new MiddlewareError('EXECUTION_FAILED', message, middlewareId, originalError);
  }

  /**
   * Create timeout error
   */
  static timeout(message: string = 'Middleware execution timeout', middlewareId?: string): MiddlewareError {
    return new MiddlewareError('TIMEOUT', message, middlewareId);
  }

  /**
   * Create configuration error
   */
  static configuration(message: string = 'Invalid middleware configuration', middlewareId?: string): MiddlewareError {
    return new MiddlewareError('CONFIGURATION_ERROR', message, middlewareId);
  }

  /**
   * Create dependency error
   */
  static dependency(message: string = 'Middleware dependency error', middlewareId?: string): MiddlewareError {
    return new MiddlewareError('DEPENDENCY_ERROR', message, middlewareId);
  }

  /**
   * Convert to plain object
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    middlewareId?: string;
    originalError?: string;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      middlewareId: this.middlewareId,
      originalError: this.originalError?.message,
      stack: this.stack,
    };
  }
}
