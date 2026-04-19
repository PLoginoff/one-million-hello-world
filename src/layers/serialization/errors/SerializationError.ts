/**
 * Serialization Error
 * 
 * Custom error class for serialization operations with detailed error information.
 */

import { SerializationErrorCode, getErrorMessage } from './SerializationErrorCode';

export interface ErrorContext {
  [key: string]: unknown;
}

export class SerializationError extends Error {
  public readonly code: SerializationErrorCode;
  public readonly context: ErrorContext;
  public timestamp: Date;
  public readonly innerError?: Error;

  constructor(
    code: SerializationErrorCode,
    message?: string,
    context: ErrorContext = {},
    innerError?: Error
  ) {
    const errorMessage = message || getErrorMessage(code);
    super(errorMessage);
    
    this.name = 'SerializationError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.innerError = innerError;
  }

  /**
   * Creates a serialization failed error
   */
  static serializationFailed(context: ErrorContext = {}, innerError?: Error): SerializationError {
    return new SerializationError(
      SerializationErrorCode.SERIALIZATION_FAILED,
      undefined,
      context,
      innerError
    );
  }

  /**
   * Creates an unsupported format error
   */
  static unsupportedFormat(format: string): SerializationError {
    return new SerializationError(
      SerializationErrorCode.UNSUPPORTED_FORMAT,
      `Unsupported serialization format: ${format}`,
      { format }
    );
  }

  /**
   * Creates a deserialization failed error
   */
  static deserializationFailed(context: ErrorContext = {}, innerError?: Error): SerializationError {
    return new SerializationError(
      SerializationErrorCode.DESERIALIZATION_FAILED,
      undefined,
      context,
      innerError
    );
  }

  /**
   * Creates a validation failed error
   */
  static validationFailed(errors: string[]): SerializationError {
    return new SerializationError(
      SerializationErrorCode.VALIDATION_FAILED,
      `Validation failed with ${errors.length} error(s)`,
      { errors }
    );
  }

  /**
   * Creates a content negotiation failed error
   */
  static contentNegotiationFailed(acceptHeader: string): SerializationError {
    return new SerializationError(
      SerializationErrorCode.CONTENT_NEGOTIATION_FAILED,
      'Content negotiation failed',
      { acceptHeader }
    );
  }

  /**
   * Converts error to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      innerError: this.innerError ? {
        name: this.innerError.name,
        message: this.innerError.message,
        stack: this.innerError.stack,
      } : undefined,
      stack: this.stack,
    };
  }

  /**
   * Creates SerializationError from plain object
   */
  static fromJSON(json: Record<string, unknown>): SerializationError {
    const error = new SerializationError(
      json.code as SerializationErrorCode,
      json.message as string,
      json.context as ErrorContext,
      json.innerError as Error | undefined
    );
    error.timestamp = new Date(json.timestamp as string);
    return error;
  }
}
