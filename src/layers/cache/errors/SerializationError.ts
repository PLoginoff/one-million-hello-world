/**
 * Serialization Error
 *
 * Thrown when cache value serialization or deserialization fails.
 *
 * @module CacheLayer/Errors
 */

import { CacheError, CacheErrorCode } from './CacheError';

/**
 * Error thrown when serialization fails
 */
export class SerializationError extends CacheError {
  /** The operation that failed ('serialize' or 'deserialize') */
  readonly operation: 'serialize' | 'deserialize';
  /** The value that failed to serialize/deserialize (if safe to include) */
  readonly value?: unknown;
  /** The target type for deserialization */
  readonly targetType?: string;

  /**
   * Create a new SerializationError
   *
   * @param operation - The operation that failed
   * @param message - Error message
   * @param context - Additional context information
   */
  constructor(operation: 'serialize' | 'deserialize', message: string, context: Record<string, unknown> = {}) {
    super(
      operation === 'serialize' ? CacheErrorCode.SERIALIZATION_ERROR : CacheErrorCode.DESERIALIZATION_ERROR,
      message,
      { ...context, operation },
      false // Serialization errors are typically not retryable
    );
    this.name = 'SerializationError';
    this.operation = operation;
  }

  /**
   * Create a serialization error
   */
  static serialize(value: unknown, originalError: Error, context: Record<string, unknown> = {}): SerializationError {
    return new SerializationError('serialize', `Failed to serialize value: ${originalError.message}`, {
      ...context,
      value: SerializationError.safeValue(value),
      originalError: originalError.message,
    });
  }

  /**
   * Create a deserialization error
   */
  static deserialize(
    data: unknown,
    targetType: string,
    originalError: Error,
    context: Record<string, unknown> = {}
  ): SerializationError {
    return new SerializationError('deserialize', `Failed to deserialize to ${targetType}: ${originalError.message}`, {
      ...context,
      data: SerializationError.safeValue(data),
      targetType,
      originalError: originalError.message,
    });
  }

  /**
   * Safely represent a value for error context (avoid circular references, large objects)
   */
  private static safeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      return value.length > 100 ? value.substring(0, 100) + '...' : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return `[Array(${value.length})]`;
    }
    if (typeof value === 'object') {
      try {
        const keys = Object.keys(value);
        return `{ ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', ...' : ''} }`;
      } catch {
        return '[Object]';
      }
    }
    return typeof value;
  }
}
