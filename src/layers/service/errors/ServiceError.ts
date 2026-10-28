/**
 * Service Error
 *
 * Base error class for all service layer errors.
 * Provides structured error information with codes and optional details.
 *
 * @module ServiceLayer/Errors
 */

export interface ServiceErrorDetails {
  /** Additional context about the error */
  [key: string]: unknown;
}

/**
 * Base service error class.
 * All service layer errors should extend this class.
 */
export class ServiceError extends Error {
  /** Unique error code for programmatic handling */
  readonly code: string;

  /** HTTP status code associated with this error */
  readonly statusCode: number;

  /** Optional additional details about the error */
  readonly details?: ServiceErrorDetails;

  /** Indicates if the operation can be retried */
  readonly retryable: boolean;

  /**
   * Creates a new ServiceError instance.
   *
   * @param code - Unique error code
   * @param message - Human-readable error message
   * @param options - Optional error configuration
   */
  constructor(
    code: string,
    message: string,
    options: {
      statusCode?: number;
      details?: ServiceErrorDetails;
      retryable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
    this.retryable = options.retryable ?? false;

    if (options.cause) {
      this.cause = options.cause;
    }

    if (Error.captureStackTrace !== undefined) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts the error to a plain object for serialization.
   *
   * @returns Plain object representation of the error
   */
  toJSON(): {
    name: string;
    code: string;
    message: string;
    statusCode: number;
    details?: ServiceErrorDetails;
    retryable: boolean;
    stack?: string;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      retryable: this.retryable,
      stack: this.stack,
    };
  }

  /**
   * Creates a ServiceError from a plain object.
   *
   * @param obj - Plain object with error properties
   * @returns ServiceError instance
   */
  static fromJSON(obj: {
    code: string;
    message: string;
    statusCode?: number;
    details?: ServiceErrorDetails;
    retryable?: boolean;
  }): ServiceError {
    return new ServiceError(obj.code, obj.message, {
      statusCode: obj.statusCode,
      details: obj.details,
      retryable: obj.retryable,
    });
  }
}
