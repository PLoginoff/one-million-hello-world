/**
 * Message Queue Error Taxonomy
 *
 * Comprehensive error hierarchy for the Message Queue Layer.
 */

import { MessageQueueErrorCode, MessageQueueErrorClass } from '../types/message-queue-types';

/**
 * Base error class for all message queue errors
 */
export class MessageQueueError extends MessageQueueErrorClass {
  readonly timestamp: number;

  constructor(code: MessageQueueErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = this.constructor.name;
    this.timestamp = Date.now();

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Queue capacity errors
 */
export class QueueFullError extends MessageQueueError {
  readonly currentSize: number;
  readonly maxSize: number;

  constructor(currentSize: number, maxSize: number) {
    super(
      MessageQueueErrorCode.QUEUE_FULL,
      `Queue is full: ${currentSize}/${maxSize}`,
      { currentSize, maxSize }
    );
    this.currentSize = currentSize;
    this.maxSize = maxSize;
  }
}

/**
 * Message not found errors
 */
export class MessageNotFoundError extends MessageQueueError {
  readonly messageId: string;

  constructor(messageId: string) {
    super(
      MessageQueueErrorCode.MESSAGE_NOT_FOUND,
      `Message not found: ${messageId}`,
      { messageId }
    );
    this.messageId = messageId;
  }
}

/**
 * Retry exhaustion errors
 */
export class MaxRetriesExceededError extends MessageQueueError {
  readonly messageId: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string;

  constructor(messageId: string, attempts: number, maxAttempts: number, lastError: string) {
    super(
      MessageQueueErrorCode.MAX_RETRIES_EXCEEDED,
      `Max retries exceeded for message ${messageId}: ${attempts}/${maxAttempts}`,
      { messageId, attempts, maxAttempts, lastError }
    );
    this.messageId = messageId;
    this.attempts = attempts;
    this.maxAttempts = maxAttempts;
    this.lastError = lastError;
  }
}

/**
 * Handler registration errors
 */
export class HandlerNotRegisteredError extends MessageQueueError {
  constructor() {
    super(
      MessageQueueErrorCode.HANDLER_NOT_REGISTERED,
      'No message handler registered',
      {}
    );
  }
}

/**
 * Queue state errors
 */
export class QueueNotRunningError extends MessageQueueError {
  readonly operation: string;

  constructor(operation: string) {
    super(
      MessageQueueErrorCode.QUEUE_NOT_RUNNING,
      `Queue is not running: cannot ${operation}`,
      { operation }
    );
    this.operation = operation;
  }
}

/**
 * Configuration errors
 */
export class InvalidConfigurationError extends MessageQueueError {
  readonly validationErrors: string[];

  constructor(validationErrors: string[]) {
    super(
      MessageQueueErrorCode.INVALID_CONFIGURATION,
      `Invalid configuration: ${validationErrors.join('; ')}`,
      { validationErrors }
    );
    this.validationErrors = validationErrors;
  }
}

/**
 * Adapter connection errors
 */
export class AdapterConnectionFailedError extends MessageQueueError {
  readonly adapterName: string;
  readonly originalError: Error | null;

  constructor(adapterName: string, originalError: Error | null = null) {
    super(
      MessageQueueErrorCode.ADAPTER_CONNECTION_FAILED,
      `Adapter connection failed: ${adapterName}`,
      { adapterName, originalError: originalError?.message }
    );
    this.adapterName = adapterName;
    this.originalError = originalError;
  }
}

/**
 * Adapter operation errors
 */
export class AdapterOperationFailedError extends MessageQueueError {
  readonly adapterName: string;
  readonly operation: string;
  readonly originalError: Error | null;

  constructor(adapterName: string, operation: string, originalError: Error | null = null) {
    super(
      MessageQueueErrorCode.ADAPTER_OPERATION_FAILED,
      `Adapter operation failed: ${adapterName}.${operation}`,
      { adapterName, operation, originalError: originalError?.message }
    );
    this.adapterName = adapterName;
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Serialization errors
 */
export class SerializationFailedError extends MessageQueueError {
  readonly data: unknown;
  readonly originalError: Error | null;

  constructor(data: unknown, originalError: Error | null = null) {
    super(
      MessageQueueErrorCode.SERIALIZATION_FAILED,
      'Failed to serialize message',
      { data: JSON.stringify(data), originalError: originalError?.message }
    );
    this.data = data;
    this.originalError = originalError;
  }
}

/**
 * Deserialization errors
 */
export class DeserializationFailedError extends MessageQueueError {
  readonly rawData: unknown;
  readonly originalError: Error | null;

  constructor(rawData: unknown, originalError: Error | null = null) {
    super(
      MessageQueueErrorCode.DESERIALIZATION_FAILED,
      'Failed to deserialize message',
      { rawData: JSON.stringify(rawData), originalError: originalError?.message }
    );
    this.rawData = rawData;
    this.originalError = originalError;
  }
}

/**
 * Error factory for creating errors from codes
 */
export class MessageQueueErrorFactory {
  static create(code: MessageQueueErrorCode, message: string, details?: Record<string, unknown>): MessageQueueError {
    switch (code) {
      case MessageQueueErrorCode.QUEUE_FULL:
        return new QueueFullError(details?.currentSize as number, details?.maxSize as number);
      case MessageQueueErrorCode.MESSAGE_NOT_FOUND:
        return new MessageNotFoundError(details?.messageId as string);
      case MessageQueueErrorCode.MAX_RETRIES_EXCEEDED:
        return new MaxRetriesExceededError(
          details?.messageId as string,
          details?.attempts as number,
          details?.maxAttempts as number,
          details?.lastError as string
        );
      case MessageQueueErrorCode.HANDLER_NOT_REGISTERED:
        return new HandlerNotRegisteredError();
      case MessageQueueErrorCode.QUEUE_NOT_RUNNING:
        return new QueueNotRunningError(details?.operation as string);
      case MessageQueueErrorCode.INVALID_CONFIGURATION:
        return new InvalidConfigurationError(details?.validationErrors as string[]);
      case MessageQueueErrorCode.ADAPTER_CONNECTION_FAILED:
        return new AdapterConnectionFailedError(details?.adapterName as string);
      case MessageQueueErrorCode.ADAPTER_OPERATION_FAILED:
        return new AdapterOperationFailedError(
          details?.adapterName as string,
          details?.operation as string
        );
      case MessageQueueErrorCode.SERIALIZATION_FAILED:
        return new SerializationFailedError(details?.data);
      case MessageQueueErrorCode.DESERIALIZATION_FAILED:
        return new DeserializationFailedError(details?.rawData);
      default:
        return new MessageQueueError(code, message, details);
    }
  }
}

/**
 * Error mapper for converting unknown errors to message queue errors
 */
export class MessageQueueErrorMapper {
  static map(error: unknown): MessageQueueError {
    if (error instanceof MessageQueueError) {
      return error;
    }

    if (error instanceof Error) {
      // Check for specific error patterns
      if (error.message.includes('queue is full') || error.message.includes('Queue is full')) {
        return new QueueFullError(0, 0);
      }
      if (error.message.includes('not found') || error.message.includes('Not found')) {
        return new MessageNotFoundError('unknown');
      }
      if (error.message.includes('max retries') || error.message.includes('Max retries')) {
        return new MaxRetriesExceededError('unknown', 0, 0, error.message);
      }
      if (error.message.includes('handler') && error.message.includes('not registered')) {
        return new HandlerNotRegisteredError();
      }
      if (error.message.includes('not running') || error.message.includes('Not running')) {
        return new QueueNotRunningError('unknown operation');
      }

      // Generic error
      return new MessageQueueError(
        MessageQueueErrorCode.ADAPTER_OPERATION_FAILED,
        error.message,
        { originalError: error.name }
      );
    }

    // Unknown error type
    return new MessageQueueError(
      MessageQueueErrorCode.ADAPTER_OPERATION_FAILED,
      'Unknown error occurred',
      { originalError: String(error) }
    );
  }
}

/**
 * Error severity levels
 */
export enum MessageQueueErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error severity mapping
 */
export const MESSAGE_QUEUE_ERROR_SEVERITY: Record<MessageQueueErrorCode, MessageQueueErrorSeverity> = {
  [MessageQueueErrorCode.QUEUE_FULL]: MessageQueueErrorSeverity.HIGH,
  [MessageQueueErrorCode.MESSAGE_NOT_FOUND]: MessageQueueErrorSeverity.MEDIUM,
  [MessageQueueErrorCode.MAX_RETRIES_EXCEEDED]: MessageQueueErrorSeverity.HIGH,
  [MessageQueueErrorCode.HANDLER_NOT_REGISTERED]: MessageQueueErrorSeverity.MEDIUM,
  [MessageQueueErrorCode.QUEUE_NOT_RUNNING]: MessageQueueErrorSeverity.MEDIUM,
  [MessageQueueErrorCode.INVALID_CONFIGURATION]: MessageQueueErrorSeverity.HIGH,
  [MessageQueueErrorCode.ADAPTER_CONNECTION_FAILED]: MessageQueueErrorSeverity.CRITICAL,
  [MessageQueueErrorCode.ADAPTER_OPERATION_FAILED]: MessageQueueErrorSeverity.HIGH,
  [MessageQueueErrorCode.SERIALIZATION_FAILED]: MessageQueueErrorSeverity.MEDIUM,
  [MessageQueueErrorCode.DESERIALIZATION_FAILED]: MessageQueueErrorSeverity.MEDIUM,
};

/**
 * Get error severity
 */
export function getMessageQueueErrorSeverity(code: MessageQueueErrorCode): MessageQueueErrorSeverity {
  return MESSAGE_QUEUE_ERROR_SEVERITY[code] ?? MessageQueueErrorSeverity.MEDIUM;
}

/**
 * Check if error is retryable
 */
export function isMessageQueueErrorRetryable(code: MessageQueueErrorCode): boolean {
  return [
    MessageQueueErrorCode.ADAPTER_CONNECTION_FAILED,
    MessageQueueErrorCode.ADAPTER_OPERATION_FAILED,
    MessageQueueErrorCode.SERIALIZATION_FAILED,
    MessageQueueErrorCode.DESERIALIZATION_FAILED,
  ].includes(code);
}