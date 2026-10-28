/**
 * Event Error Base Class
 *
 * Base class for all event-related errors.
 * Provides structured error information with error codes and context.
 *
 * @module EventLayer/Errors
 */

/**
 * Base error class for event system errors.
 */
export abstract class EventError extends Error {
  /** Unique error code for programmatic handling */
  public readonly code: string;

  /** Additional context data for debugging */
  public readonly context: Record<string, unknown>;

  /** Timestamp when the error occurred */
  public readonly timestamp: number;

  /**
   * Creates a new EventError.
   *
   * @param code - Unique error code
   * @param message - Human-readable error message
   * @param context - Additional context data
   */
  constructor(code: string, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.timestamp = Date.now();

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts the error to a JSON-serializable object.
   *
   * @returns Error data as plain object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * Creates a new error with additional context.
   *
   * @param additionalContext - Additional context to merge
   * @returns New error instance with merged context
   */
  withContext(additionalContext: Record<string, unknown>): EventError {
    const newError = Object.create(Object.getPrototypeOf(this));
    Object.assign(newError, this);
    newError.context = { ...this.context, ...additionalContext };
    return newError;
  }
}
