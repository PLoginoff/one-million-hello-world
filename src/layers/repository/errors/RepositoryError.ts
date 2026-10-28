/**
 * Repository Error
 *
 * Base error class for all repository-related errors.
 * Provides structured error information with codes and context.
 */

export abstract class RepositoryError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly timestamp: Date;

  constructor(
    code: string,
    message: string,
    options: {
      statusCode?: number;
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.timestamp = new Date();

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to a plain object for serialization
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    statusCode: number;
    retryable: boolean;
    details?: Record<string, unknown>;
    timestamp: string;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Create a RepositoryResult from this error
   */
  toRepositoryResult<T>(): {
    success: false;
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
  } {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}
