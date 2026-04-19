/**
 * Security Error
 * 
 * Custom error class for security-related errors.
 */

export class SecurityError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number = 401) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create authentication error
   */
  static authenticationFailed(message: string = 'Authentication failed'): SecurityError {
    return new SecurityError('AUTH_FAILED', message, 401);
  }

  /**
   * Create authorization error
   */
  static authorizationFailed(message: string = 'Authorization failed'): SecurityError {
    return new SecurityError('AUTHZ_FAILED', message, 403);
  }

  /**
   * Create invalid token error
   */
  static invalidToken(message: string = 'Invalid token'): SecurityError {
    return new SecurityError('INVALID_TOKEN', message, 401);
  }

  /**
   * Create expired token error
   */
  static expiredToken(message: string = 'Token expired'): SecurityError {
    return new SecurityError('EXPIRED_TOKEN', message, 401);
  }

  /**
   * Create threat detected error
   */
  static threatDetected(message: string = 'Threat detected'): SecurityError {
    return new SecurityError('THREAT_DETECTED', message, 403);
  }

  /**
   * Create rate limit exceeded error
   */
  static rateLimitExceeded(message: string = 'Rate limit exceeded'): SecurityError {
    return new SecurityError('RATE_LIMIT_EXCEEDED', message, 429);
  }

  /**
   * Create invalid credentials error
   */
  static invalidCredentials(message: string = 'Invalid credentials'): SecurityError {
    return new SecurityError('INVALID_CREDENTIALS', message, 401);
  }

  /**
   * Create account locked error
   */
  static accountLocked(message: string = 'Account locked'): SecurityError {
    return new SecurityError('ACCOUNT_LOCKED', message, 423);
  }

  /**
   * Convert to plain object
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    statusCode: number;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      stack: this.stack,
    };
  }
}
