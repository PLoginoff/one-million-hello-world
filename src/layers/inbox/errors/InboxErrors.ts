/**
 * Inbox Error Taxonomy
 *
 * Comprehensive error hierarchy for the Inbox Layer.
 */

import { InboxErrorCode, InboxErrorClass } from '../types/inbox-types';

/**
 * Base error class for all inbox errors
 */
export class InboxError extends InboxErrorClass {
  readonly code: InboxErrorCode;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;

  constructor(code: InboxErrorCode, message: string, details?: Record<string, unknown>) {
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
export class MessageNotFoundError extends InboxError {
  readonly inboxId: string;

  constructor(inboxId: string) {
    super(
      InboxErrorCode.MESSAGE_NOT_FOUND,
      `Inbox message not found: ${inboxId}`,
      { inboxId }
    );
    this.inboxId = inboxId;
  }
}

/**
 * Duplicate message errors
 */
export class DuplicateMessageError extends InboxError {
  readonly messageId: string;
  readonly originalInboxId: string;

  constructor(messageId: string, originalInboxId: string) {
    super(
      InboxErrorCode.DUPLICATE_MESSAGE,
      `Duplicate message detected: ${messageId} (original: ${originalInboxId})`,
      { messageId, originalInboxId }
    );
    this.messageId = messageId;
    this.originalInboxId = originalInboxId;
  }
}

/**
 * Retry exhaustion errors
 */
export class MaxRetriesExceededError extends InboxError {
  readonly inboxId: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string;

  constructor(inboxId: string, attempts: number, maxAttempts: number, lastError: string) {
    super(
      InboxErrorCode.MAX_RETRIES_EXCEEDED,
      `Max retries exceeded for message ${inboxId}: ${attempts}/${maxAttempts}`,
      { inboxId, attempts, maxAttempts, lastError }
    );
    this.inboxId = inboxId;
    this.attempts = attempts;
    this.maxAttempts = maxAttempts;
    this.lastError = lastError;
  }
}

/**
 * Message already processed errors
 */
export class MessageAlreadyProcessedError extends InboxError {
  readonly inboxId: string;
  readonly currentStatus: string;

  constructor(inboxId: string, currentStatus: string) {
    super(
      InboxErrorCode.MESSAGE_ALREADY_PROCESSED,
      `Message ${inboxId} already processed with status: ${currentStatus}`,
      { inboxId, currentStatus }
    );
    this.inboxId = inboxId;
    this.currentStatus = currentStatus;
  }
}

/**
 * Configuration errors
 */
export class InvalidConfigurationError extends InboxError {
  readonly validationErrors: string[];

  constructor(validationErrors: string[]) {
    super(
      InboxErrorCode.INVALID_CONFIGURATION,
      `Invalid configuration: ${validationErrors.join('; ')}`,
      { validationErrors }
    );
    this.validationErrors = validationErrors;
  }
}

/**
 * Adapter connection errors
 */
export class AdapterConnectionFailedError extends InboxError {
  readonly adapterName: string;
  readonly originalError: Error | null;

  constructor(adapterName: string, originalError: Error | null = null) {
    super(
      InboxErrorCode.ADAPTER_CONNECTION_FAILED,
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
export class AdapterOperationFailedError extends InboxError {
  readonly adapterName: string;
  readonly operation: string;
  readonly originalError: Error | null;

  constructor(adapterName: string, operation: string, originalError: Error | null = null) {
    super(
      InboxErrorCode.ADAPTER_OPERATION_FAILED,
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
export class SerializationFailedError extends InboxError {
  readonly data: unknown;
  readonly originalError: Error | null;

  constructor(data: unknown, originalError: Error | null = null) {
    super(
      InboxErrorCode.SERIALIZATION_FAILED,
      'Failed to serialize inbox message',
      { data: JSON.stringify(data), originalError: originalError?.message }
    );
    this.data = data;
    this.originalError = originalError;
  }
}

/**
 * Deserialization errors
 */
export class DeserializationFailedError extends InboxError {
  readonly rawData: unknown;
  readonly originalError: Error | null;

  constructor(rawData: unknown, originalError: Error | null = null) {
    super(
      InboxErrorCode.DESERIALIZATION_FAILED,
      'Failed to deserialize inbox message',
      { rawData: JSON.stringify(rawData), originalError: originalError?.message }
    );
    this.rawData = rawData;
    this.originalError = originalError;
  }
}

/**
 * Batch processing errors
 */
export class BatchProcessingFailedError extends InboxError {
  readonly batchId: string;
  readonly processedCount: number;
  readonly failedCount: number;
  readonly duplicateCount: number;
  readonly errors: Array<{ inboxId: string; error: string }>;

  constructor(batchId: string, processedCount: number, failedCount: number, duplicateCount: number, errors: Array<{ inboxId: string; error: string }>) {
    super(
      InboxErrorCode.BATCH_PROCESSING_FAILED,
      `Batch processing failed: ${batchId} (${processedCount} processed, ${failedCount} failed, ${duplicateCount} duplicates)`,
      { batchId, processedCount, failedCount, duplicateCount, errors }
    );
    this.batchId = batchId;
    this.processedCount = processedCount;
    this.failedCount = failedCount;
    this.duplicateCount = duplicateCount;
    this.errors = errors;
  }
}

/**
 * Deduplication errors
 */
export class DeduplicationFailedError extends InboxError {
  readonly messageId: string;
  readonly originalError: Error | null;

  constructor(messageId: string, originalError: Error | null = null) {
    super(
      InboxErrorCode.DEDUPLICATION_FAILED,
      `Deduplication failed for message ${messageId}`,
      { messageId, originalError: originalError?.message }
    );
    this.messageId = messageId;
    this.originalError = originalError;
  }
}

/**
 * Error factory for creating errors from codes
 */
export class InboxErrorFactory {
  static create(code: InboxErrorCode, message: string, details?: Record<string, unknown>): InboxError {
    switch (code) {
      case InboxErrorCode.MESSAGE_NOT_FOUND:
        return new MessageNotFoundError(details?.inboxId as string);
      case InboxErrorCode.DUPLICATE_MESSAGE:
        return new DuplicateMessageError(details?.messageId as string, details?.originalInboxId as string);
      case InboxErrorCode.MAX_RETRIES_EXCEEDED:
        return new MaxRetriesExceededError(
          details?.inboxId as string,
          details?.attempts as number,
          details?.maxAttempts as number,
          details?.lastError as string
        );
      case InboxErrorCode.MESSAGE_ALREADY_PROCESSED:
        return new MessageAlreadyProcessedError(details?.inboxId as string, details?.currentStatus as string);
      case InboxErrorCode.INVALID_CONFIGURATION:
        return new InvalidConfigurationError(details?.validationErrors as string[]);
      case InboxErrorCode.ADAPTER_CONNECTION_FAILED:
        return new AdapterConnectionFailedError(details?.adapterName as string);
      case InboxErrorCode.ADAPTER_OPERATION_FAILED:
        return new AdapterOperationFailedError(details?.adapterName as string, details?.operation as string);
      case InboxErrorCode.SERIALIZATION_FAILED:
        return new SerializationFailedError(details?.data);
      case InboxErrorCode.DESERIALIZATION_FAILED:
        return new DeserializationFailedError(details?.rawData);
      case InboxErrorCode.BATCH_PROCESSING_FAILED:
        return new BatchProcessingFailedError(
          details?.batchId as string,
          details?.processedCount as number,
          details?.failedCount as number,
          details?.duplicateCount as number,
          details?.errors as Array<{ inboxId: string; error: string }>
        );
      case InboxErrorCode.DEDUPLICATION_FAILED:
        return new DeduplicationFailedError(details?.messageId as string);
      default:
        return new InboxError(code, message, details);
    }
  }
}

/**
 * Error mapper for converting unknown errors to inbox errors
 */
export class InboxErrorMapper {
  static map(error: unknown): InboxError {
    if (error instanceof InboxError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('Not found')) {
        return new MessageNotFoundError('unknown');
      }
      if (error.message.includes('duplicate') || error.message.includes('Duplicate')) {
        return new DuplicateMessageError('unknown', 'unknown');
      }
      if (error.message.includes('max retries') || error.message.includes('Max retries')) {
        return new MaxRetriesExceededError('unknown', 0, 0, error.message);
      }
      if (error.message.includes('already processed') || error.message.includes('Already processed')) {
        return new MessageAlreadyProcessedError('unknown', 'unknown');
      }
      if (error.message.includes('batch') && error.message.includes('failed')) {
        return new BatchProcessingFailedError('unknown', 0, 0, 0, []);
      }
      if (error.message.includes('deduplication') && error.message.includes('failed')) {
        return new DeduplicationFailedError('unknown', error);
      }

      return new InboxError(
        InboxErrorCode.ADAPTER_OPERATION_FAILED,
        error.message,
        { originalError: error.name }
      );
    }

    return new InboxError(
      InboxErrorCode.ADAPTER_OPERATION_FAILED,
      'Unknown error occurred',
      { originalError: String(error) }
    );
  }
}

/**
 * Error severity levels
 */
export enum InboxErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error severity mapping
 */
export const INBOX_ERROR_SEVERITY: Record<InboxErrorCode, InboxErrorSeverity> = {
  [InboxErrorCode.MESSAGE_NOT_FOUND]: InboxErrorSeverity.MEDIUM,
  [InboxErrorCode.DUPLICATE_MESSAGE]: InboxErrorSeverity.MEDIUM,
  [InboxErrorCode.MAX_RETRIES_EXCEEDED]: InboxErrorSeverity.HIGH,
  [InboxErrorCode.MESSAGE_ALREADY_PROCESSED]: InboxErrorSeverity.MEDIUM,
  [InboxErrorCode.INVALID_CONFIGURATION]: InboxErrorSeverity.HIGH,
  [InboxErrorCode.ADAPTER_CONNECTION_FAILED]: InboxErrorSeverity.CRITICAL,
  [InboxErrorCode.ADAPTER_OPERATION_FAILED]: InboxErrorSeverity.HIGH,
  [InboxErrorCode.SERIALIZATION_FAILED]: InboxErrorSeverity.MEDIUM,
  [InboxErrorCode.DESERIALIZATION_FAILED]: InboxErrorSeverity.MEDIUM,
  [InboxErrorCode.BATCH_PROCESSING_FAILED]: InboxErrorSeverity.HIGH,
  [InboxErrorCode.DEDUPLICATION_FAILED]: InboxErrorSeverity.HIGH,
};

/**
 * Get error severity
 */
export function getInboxErrorSeverity(code: InboxErrorCode): InboxErrorSeverity {
  return INBOX_ERROR_SEVERITY[code] ?? InboxErrorSeverity.MEDIUM;
}

/**
 * Check if error is retryable
 */
export function isInboxErrorRetryable(code: InboxErrorCode): boolean {
  return [
    InboxErrorCode.ADAPTER_CONNECTION_FAILED,
    InboxErrorCode.ADAPTER_OPERATION_FAILED,
    InboxErrorCode.SERIALIZATION_FAILED,
    InboxErrorCode.DESERIALIZATION_FAILED,
    InboxErrorCode.BATCH_PROCESSING_FAILED,
    InboxErrorCode.DEDUPLICATION_FAILED,
  ].includes(code);
}