/**
 * Base Serialization Error
 * 
 * Base class for all serialization-related errors.
 */

export class BaseSerializationError extends Error {
  public readonly code: string;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;
  public readonly cause?: Error;

  constructor(
    code: string,
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = new Date();
    this.context = context;
    this.cause = cause;

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Gets error code
   */
  getCode(): string {
    return this.code;
  }

  /**
   * Gets error timestamp
   */
  getTimestamp(): Date {
    return this.timestamp;
  }

  /**
   * Gets error context
   */
  getContext(): Record<string, unknown> | undefined {
    return this.context;
  }

  /**
   * Gets error cause
   */
  getCause(): Error | undefined {
    return this.cause;
  }

  /**
   * Converts error to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
      } : undefined,
      stack: this.stack,
    };
  }

  /**
   * Converts error to string
   */
  toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}
