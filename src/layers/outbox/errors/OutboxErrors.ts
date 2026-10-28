/**
 * Outbox Error Taxonomy
 *
 * Comprehensive error hierarchy for the Outbox Layer.
 */

import { OutboxErrorCode } from '../types/outbox-types';

/**
 * Base error class for all outbox errors
 */
export abstract class OutboxError extends Error {
  readonly code: OutboxErrorCode;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;

  constructor(code: OutboxErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = Date.now();
    this.details = details;

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
 * Message not found errors
 */
export class MessageNotFoundError extends OutboxError {
  readonly messageId: string;

  constructor(messageId: string) {
    super(
      OutboxErrorCode.MESSAGE_NOT_FOUND,
      `Outbox message not found: ${messageId}`,
      { messageId }
    );
    this.messageId = messageId;
  }
}

/**
 * Retry exhaustion errors
 */
export class MaxRetriesExceededError extends OutboxError {
  readonly messageId: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string;

  constructor(messageId: string, attempts: number, maxAttempts: number, lastError: string) {
    super(
      OutboxErrorCode.MAX_RETRIES_EXCEEDED,
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
 * Message already processed errors
 */
export class MessageAlreadyProcessedError extends OutboxError {
  readonly messageId: string;
  readonly currentStatus: string;

  constructor(messageId: string, currentStatus: string) {
    super(
      OutboxErrorCode.MESSAGE_ALREADY_PROCESSED,
      `Message ${messageId} already processed with status: ${currentStatus}`,
      { messageId, currentStatus }
    );
    this.messageId = messageId;
    this.currentStatus = currentStatus;
  }
}

/**
 * Configuration errors
 */
export class InvalidConfigurationError extends OutboxError {
  readonly validationErrors: string[];

  constructor(validationErrors: string[]) {
    super(
      OutboxErrorCode.INVALID_CONFIGURATION,
      `Invalid configuration: ${validationErrors.join('; ')}`,
      { validationErrors }
    );
    this.validationErrors = validationErrors;
  }
}

/**
 * Adapter connection errors
 */
export class AdapterConnectionFailedError extends OutboxError {
  readonly adapterName: string;
  readonly originalError: Error | null;

  constructor(adapterName: string, originalError: Error | null = null) {
    super(
      OutboxErrorCode.ADAPTER_CONNECTION_FAILED,
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
export class AdapterOperationFailedError extends OutboxError {
  readonly adapterName: string;
  readonly operation: string;
  readonly originalError: Error | null;

  constructor(adapterName: string, operation: string, originalError: Error | null = null) {
    super(
      OutboxErrorCode.ADAPTER_OPERATION_FAILED,
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
export class SerializationFailedError extends OutboxError {
  readonly data: unknown;
  readonly originalError: Error | null;

  constructor(data: unknown, originalError: Error | null = null) {
    super(
      OutboxErrorCode.SERIALIZATION_FAILED,
      'Failed to serialize outbox message',
      { data: JSON.stringify(data), originalError: originalError?.message }
    );
    this.data = data;
    this.originalError = originalError;
  }
}

/**
 * Deserialization errors
 */
export class DeserializationFailedError extends OutboxError {
  readonly rawData: unknown;
  readonly originalError: Error | null;

  constructor(rawData: unknown, originalError: Error | null = null) {
    super(
      OutboxErrorCode.DESERIALIZATION_FAILED,
      'Failed to deserialize outbox message',
      { rawData: JSON.stringify(rawData), originalError: originalError?.message }
    );
    this.rawData = rawData;
    this.originalError = originalError;
  }
}

/**
 * Batch processing errors
 */
export class BatchProcessingFailedError extends OutboxError {
  readonly batchId: string;
  readonly processedCount: number;
  readonly failedCount: number;
  readonly errors: Array<{ messageId: string; error: string }>;

  constructor(batchId: string, processedCount: number, failedCount: number, errors: Array<{ messageId: string; error: string }>) {
    super(
      OutboxErrorCode.BATCH_PROCESSING_FAILED,
      `Batch processing failed: ${batchId} (${processedCount} processed, ${failedCount} failed)`,
      { batchId, processedCount, failedCount, errors }
    );
    this.batchId = batchId;
    this.processedCount = processedCount;
    this.failedCount = failedCount;
    this.errors = errors;
  }
}

/**
 * Error factory for creating errors from codes
 */
export class OutboxErrorFactory {
  static create(code: OutboxErrorCode, message: string, details?: Record<string, unknown>): OutboxError {
    switch (code) {
      case OutboxErrorCode.MESSAGE_NOT_FOUND:
        return new MessageNotFoundError(details?.messageId as string);
      case OutboxErrorCode.MAX_RETRIES_EXCEEDED:
        return new MaxRetriesExceededError(
          details?.messageId as string,
          details?.attempts as number,
          details?.maxAttempts as number,
          details?.lastError as string
        );
      case OutboxErrorCode.MESSAGE_ALREADY_PROCESSED:
        return new MessageAlreadyProcessedError(details?.messageId as string, details?.currentStatus as string);
      case OutboxErrorCode.INVALID_CONFIGURATION:
        return new InvalidConfigurationError(details?.validationErrors as string[]);
      case OutboxErrorCode.ADAPTER_CONNECTION_FAILED:
        return new AdapterConnectionFailedError(details?.adapterName as string);
      case OutboxErrorCode.ADAPTER_OPERATION_FAILED:
        return new AdapterOperationFailedError(details?.adapterName as string, details?.operation as string);
      case OutboxErrorCode.SERIALIZATION_FAILED:
        return new SerializationFailedError(details?.data);
      case OutboxErrorCode.DESERIALIZATION_FAILED:
        return new DeserializationFailedError(details?.rawData);
      case OutboxErrorCode.BATCH_PROCESSING_FAILED:
        return new BatchProcessingFailedError(
          details?.batchId as string,
          details?.processedCount as number,
          details?.failedCount as number,
          details?.errors as Array<{ messageId: string; error: string }>
        );
      default:
        return new OutboxError(code, message, details);
    }
  }
}

/**
 * Error mapper for converting unknown errors to outbox errors
 */
export class OutboxErrorMapper {
  static map(error: unknown): OutboxError {
    if (error instanceof OutboxError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('Not found')) {
        return new MessageNotFoundError('unknown');
      }
      if (error.message.includes('max retries') || error.message.includes('Max retries')) {
        return new MaxRetriesExceededError('unknown', 0, 0, error.message);
      }
      if (error.message.includes('already processed') || error.message.includes('Already processed')) {
        return new MessageAlreadyProcessedError('unknown', 'unknown');
      }
      if (error.message.includes('batch') && error.message.includes('failed')) {
        return new BatchProcessingFailedError('unknown', 0, 0, []);
      }

      return new OutboxError(
        OutboxErrorCode.ADAPTER_OPERATION_FAILED,
        error.message,
        { originalError: error.name }
      );
    }

    return new OutboxError(
      OutboxErrorCode.ADAPTER_OPERATION_FAILED,
      'Unknown error occurred',
      { originalError: String(error) }
    );
  }
}

/**
 * Error severity levels
 */
export enum OutboxErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error severity mapping
 */
export const OUTBOX_ERROR_SEVERITY: Record<OutboxErrorCode, OutboxErrorSeverity> = {
  [OutboxErrorCode.MESSAGE_NOT_FOUND]: OutboxErrorSeverity.MEDIUM,
  [OutboxErrorCode.MAX_RETRIES_EXCEEDED]: OutboxErrorSeverity.HIGH,
  [OutboxErrorCode.MESSAGE_ALREADY_PROCESSED]: OutboxErrorSeverity.MEDIUM,
  [OutboxErrorCode.INVALID_CONFIGURATION]: OutboxErrorSeverity.HIGH,
  [OutboxErrorCode.ADAPTER_CONNECTION_FAILED]: OutboxErrorSeverity.CRITICAL,
  [OutboxErrorCode.ADAPTER_OPERATION_FAILED]: OutboxErrorSeverity.HIGH,
  [OutboxErrorCode.SERIALIZATION_FAILED]: OutboxErrorSeverity.MEDIUM,
  [OutboxErrorCode.DESERIALIZATION_FAILED]: OutboxErrorSeverity.MEDIUM,
  [OutboxErrorCode.BATCH_PROCESSING_FAILED]: OutboxErrorSeverity.HIGH,
};

/**
 * Get error severity
 */
export function getOutboxErrorSeverity(code: OutboxErrorCode): OutboxErrorSeverity {
  return OUTBOX_ERROR_SEVERITY[code] ?? OutboxErrorSeverity.MEDIUM;
}

/**
 * Check if error is retryable
 */
export function isOutboxErrorRetryable(code: OutboxErrorCode): boolean {
  return [
    OutboxErrorCode.ADAPTER_CONNECTION_FAILED,
    OutboxErrorCode.ADAPTER_OPERATION_FAILED,
    OutboxErrorCode.SERIALIZATION_FAILED,
    OutboxErrorCode.DESERIALIZATION_FAILED,
    OutboxErrorCode.BATCH_PROCESSING_FAILED,
  ].includes(code);
}