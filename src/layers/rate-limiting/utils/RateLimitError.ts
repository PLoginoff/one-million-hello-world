/**
 * Rate Limit Error
 * 
 * Custom error class for rate limiting errors.
 */

export class RateLimitError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryAfter?: number;

  constructor(code: string, message: string, statusCode: number = 429, retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create rate limit exceeded error
   */
  static rateLimitExceeded(message: string = 'Rate limit exceeded', retryAfter?: number): RateLimitError {
    return new RateLimitError('RATE_LIMIT_EXCEEDED', message, 429, retryAfter);
  }

  /**
   * Create invalid key error
   */
  static invalidKey(message: string = 'Invalid rate limit key'): RateLimitError {
    return new RateLimitError('INVALID_KEY', message, 400);
  }

  /**
   * Create configuration error
   */
  static configurationError(message: string = 'Invalid configuration'): RateLimitError {
    return new RateLimitError('CONFIG_ERROR', message, 500);
  }

  /**
   * Create algorithm error
   */
  static algorithmError(message: string = 'Algorithm error'): RateLimitError {
    return new RateLimitError('ALGORITHM_ERROR', message, 500);
  }

  /**
   * Convert to plain object
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    statusCode: number;
    retryAfter?: number;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryAfter: this.retryAfter,
      stack: this.stack,
    };
  }
}
