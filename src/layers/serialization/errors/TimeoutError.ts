/**
 * Timeout Error
 * 
 * Error thrown when operation times out.
 */

import { BaseSerializationError } from './BaseSerializationError';

export class TimeoutError extends BaseSerializationError {
  constructor(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super('TIMEOUT_ERROR', message, context, cause);
  }

  /**
   * Creates error for operation timeout
   */
  static operationTimeout(operation: string, timeout: number): TimeoutError {
    return new TimeoutError(
      `Operation '${operation}' timed out after ${timeout}ms`,
      { operation, timeout }
    );
  }

  /**
   * Creates error for serialization timeout
   */
  static serializationTimeout(timeout: number): TimeoutError {
    return new TimeoutError(
      `Serialization timed out after ${timeout}ms`,
      { timeout }
    );
  }

  /**
   * Creates error for deserialization timeout
   */
  static deserializationTimeout(timeout: number): TimeoutError {
    return new TimeoutError(
      `Deserialization timed out after ${timeout}ms`,
      { timeout }
    );
  }
}
