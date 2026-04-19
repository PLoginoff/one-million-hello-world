/**
 * Strategy Error
 * 
 * Error thrown when serialization strategy fails.
 */

import { BaseSerializationError } from './BaseSerializationError';

export class StrategyError extends BaseSerializationError {
  constructor(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super('STRATEGY_ERROR', message, context, cause);
  }

  /**
   * Creates error for unsupported format
   */
  static unsupportedFormat(format: string): StrategyError {
    return new StrategyError(
      `Unsupported serialization format: ${format}`,
      { format }
    );
  }

  /**
   * Creates error for serialization failure
   */
  static serializationFailed(data?: unknown, cause?: Error): StrategyError {
    return new StrategyError(
      'Serialization failed',
      { dataType: typeof data },
      cause
    );
  }

  /**
   * Creates error for deserialization failure
   */
  static deserializationFailed(data?: string, cause?: Error): StrategyError {
    return new StrategyError(
      'Deserialization failed',
      { dataLength: data?.length },
      cause
    );
  }

  /**
   * Creates error when data cannot be serialized
   */
  static cannotSerialize(data: unknown): StrategyError {
    return new StrategyError(
      'Data cannot be serialized by this strategy',
      { dataType: typeof data }
    );
  }

  /**
   * Creates error when data cannot be deserialized
   */
  static cannotDeserialize(data: string): StrategyError {
    return new StrategyError(
      'Data cannot be deserialized by this strategy',
      { dataLength: data.length }
    );
  }
}
