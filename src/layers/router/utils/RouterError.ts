/**
 * Router Error
 * 
 * Custom error class for router errors.
 */

export class RouterError extends Error {
  readonly code: string;
  readonly path?: string;
  readonly method?: string;

  constructor(code: string, message: string, path?: string, method?: string) {
    super(message);
    this.name = 'RouterError';
    this.code = code;
    this.path = path;
    this.method = method;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create route not found error
   */
  static notFound(path: string, method: string): RouterError {
    return new RouterError('ROUTE_NOT_FOUND', `Route not found: ${method} ${path}`, path, method);
  }

  /**
   * Create method not allowed error
   */
  static methodNotAllowed(path: string, method: string): RouterError {
    return new RouterError('METHOD_NOT_ALLOWED', `Method not allowed: ${method} ${path}`, path, method);
  }

  /**
   * Create invalid route error
   */
  static invalidRoute(message: string, path?: string): RouterError {
    return new RouterError('INVALID_ROUTE', message, path);
  }

  /**
   * Convert to plain object
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    path?: string;
    method?: string;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      path: this.path,
      method: this.method,
      stack: this.stack,
    };
  }
}
