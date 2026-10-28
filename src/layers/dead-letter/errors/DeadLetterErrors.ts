/**
 * DeadLetter Error Taxonomy
 *
 * Comprehensive error hierarchy for the DeadLetter Layer.
 */

import { DeadLetterErrorCode } from '../types/dead-letter-types';

/**
 * Base error class for all dead letter errors
 */
export class DeadLetterError extends Error {
  readonly code: DeadLetterErrorCode;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;

  constructor(code: DeadLetterErrorCode, message: string, details?: Record<string, unknown>) {
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
 * Queue capacity errors
 */
export class QueueFullError extends DeadLetterError {
  readonly currentSize: number;
  readonly maxSize: number;

  constructor(currentSize: number, maxSize: number) {
    super(
      DeadLetterErrorCode.QUEUE_FULL,
      `Dead letter queue is full: ${currentSize}/${maxSize}`,
      { currentSize, maxSize }
    );
    this.currentSize = currentSize;
    this.maxSize = maxSize;
  }
}

/**
 * Entry not found errors
 */
export class EntryNotFoundError extends DeadLetterError {
  readonly entryId: string;

  constructor(entryId: string) {
    super(
      DeadLetterErrorCode.ENTRY_NOT_FOUND,
      `Dead letter entry not found: ${entryId}`,
      { entryId }
    );
    this.entryId = entryId;
  }
}

/**
 * Retry exhaustion errors
 */
export class MaxRetriesExceededError extends DeadLetterError {
  readonly entryId: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string;

  constructor(entryId: string, attempts: number, maxAttempts: number, lastError: string) {
    super(
      DeadLetterErrorCode.MAX_RETRIES_EXCEEDED,
      `Max retries exceeded for entry ${entryId}: ${attempts}/${maxAttempts}`,
      { entryId, attempts, maxAttempts, lastError }
    );
    this.entryId = entryId;
    this.attempts = attempts;
    this.maxAttempts = maxAttempts;
    this.lastError = lastError;
  }
}

/**
 * Replay errors
 */
export class ReplayFailedError extends DeadLetterError {
  readonly entryId: string;
  readonly targetQueue: string;
  readonly originalError: Error | null;

  constructor(entryId: string, targetQueue: string, originalError: Error | null = null) {
    super(
      DeadLetterErrorCode.REPLAY_FAILED,
      `Failed to replay entry ${entryId} to queue ${targetQueue}`,
      { entryId, targetQueue, originalError: originalError?.message }
    );
    this.entryId = entryId;
    this.targetQueue = targetQueue;
    this.originalError = originalError;
  }
}

/**
 * Archive errors
 */
export class ArchiveFailedError extends DeadLetterError {
  readonly entryId: string;
  readonly archiveLocation: string;
  readonly originalError: Error | null;

  constructor(entryId: string, archiveLocation: string, originalError: Error | null = null) {
    super(
      DeadLetterErrorCode.ARCHIVE_FAILED,
      `Failed to archive entry ${entryId} to ${archiveLocation}`,
      { entryId, archiveLocation, originalError: originalError?.message }
    );
    this.entryId = entryId;
    this.archiveLocation = archiveLocation;
    this.originalError = originalError;
  }
}

/**
 * Configuration errors
 */
export class InvalidConfigurationError extends DeadLetterError {
  readonly validationErrors: string[];

  constructor(validationErrors: string[]) {
    super(
      DeadLetterErrorCode.INVALID_CONFIGURATION,
      `Invalid configuration: ${validationErrors.join('; ')}`,
      { validationErrors }
    );
    this.validationErrors = validationErrors;
  }
}

/**
 * Adapter connection errors
 */
export class AdapterConnectionFailedError extends DeadLetterError {
  readonly adapterName: string;
  readonly originalError: Error | null;

  constructor(adapterName: string, originalError: Error | null = null) {
    super(
      DeadLetterErrorCode.ADAPTER_CONNECTION_FAILED,
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
export class AdapterOperationFailedError extends DeadLetterError {
  readonly adapterName: string;
  readonly operation: string;
  readonly originalError: Error | null;

  constructor(adapterName: string, operation: string, originalError: Error | null = null) {
    super(
      DeadLetterErrorCode.ADAPTER_OPERATION_FAILED,
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
export class SerializationFailedError extends DeadLetterError {
  readonly data: unknown;
  readonly originalError: Error | null;

  constructor(data: unknown, originalError: Error | null = null) {
    super(
      DeadLetterErrorCode.SERIALIZATION_FAILED,
      'Failed to serialize dead letter entry',
      { data: JSON.stringify(data), originalError: originalError?.message }
    );
    this.data = data;
    this.originalError = originalError;
  }
}

/**
 * Deserialization errors
 */
export class DeserializationFailedError extends DeadLetterError {
  readonly rawData: unknown;
  readonly originalError: Error | null;

  constructor(rawData: unknown, originalError: Error | null = null) {
    super(
      DeadLetterErrorCode.DESERIALIZATION_FAILED,
      'Failed to deserialize dead letter entry',
      { rawData: JSON.stringify(rawData), originalError: originalError?.message }
    );
    this.rawData = rawData;
    this.originalError = originalError;
  }
}

/**
 * Retry not allowed errors
 */
export class RetryNotAllowedError extends DeadLetterError {
  readonly entryId: string;
  readonly reason: string;

  constructor(entryId: string, reason: string) {
    super(
      DeadLetterErrorCode.RETRY_NOT_ALLOWED,
      `Retry not allowed for entry ${entryId}: ${reason}`,
      { entryId, reason }
    );
    this.entryId = entryId;
    this.reason = reason;
  }
}

/**
 * Replay not allowed errors
 */
export class ReplayNotAllowedError extends DeadLetterError {
  readonly entryId: string;
  readonly reason: string;

  constructor(entryId: string, reason: string) {
    super(
      DeadLetterErrorCode.REPLAY_NOT_ALLOWED,
      `Replay not allowed for entry ${entryId}: ${reason}`,
      { entryId, reason }
    );
    this.entryId = entryId;
    this.reason = reason;
  }
}

/**
 * Error factory for creating errors from codes
 */
export class DeadLetterErrorFactory {
  static create(code: DeadLetterErrorCode, message: string, details?: Record<string, unknown>): DeadLetterError {
    switch (code) {
      case DeadLetterErrorCode.QUEUE_FULL:
        return new QueueFullError(details?.currentSize as number, details?.maxSize as number);
      case DeadLetterErrorCode.ENTRY_NOT_FOUND:
        return new EntryNotFoundError(details?.entryId as string);
      case DeadLetterErrorCode.MAX_RETRIES_EXCEEDED:
        return new MaxRetriesExceededError(
          details?.entryId as string,
          details?.attempts as number,
          details?.maxAttempts as number,
          details?.lastError as string
        );
      case DeadLetterErrorCode.REPLAY_FAILED:
        return new ReplayFailedError(details?.entryId as string, details?.targetQueue as string);
      case DeadLetterErrorCode.ARCHIVE_FAILED:
        return new ArchiveFailedError(details?.entryId as string, details?.archiveLocation as string);
      case DeadLetterErrorCode.INVALID_CONFIGURATION:
        return new InvalidConfigurationError(details?.validationErrors as string[]);
      case DeadLetterErrorCode.ADAPTER_CONNECTION_FAILED:
        return new AdapterConnectionFailedError(details?.adapterName as string);
      case DeadLetterErrorCode.ADAPTER_OPERATION_FAILED:
        return new AdapterOperationFailedError(details?.adapterName as string, details?.operation as string);
      case DeadLetterErrorCode.SERIALIZATION_FAILED:
        return new SerializationFailedError(details?.data);
      case DeadLetterErrorCode.DESERIALIZATION_FAILED:
        return new DeserializationFailedError(details?.rawData);
      case DeadLetterErrorCode.RETRY_NOT_ALLOWED:
        return new RetryNotAllowedError(details?.entryId as string, details?.reason as string);
      case DeadLetterErrorCode.REPLAY_NOT_ALLOWED:
        return new ReplayNotAllowedError(details?.entryId as string, details?.reason as string);
      default:
        return new DeadLetterError(code, message, details);
    }
  }
}

/**
 * Error mapper for converting unknown errors to dead letter errors
 */
export class DeadLetterErrorMapper {
  static map(error: unknown): DeadLetterError {
    if (error instanceof DeadLetterError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.message.includes('queue is full') || error.message.includes('Queue is full')) {
        return new QueueFullError(0, 0);
      }
      if (error.message.includes('not found') || error.message.includes('Not found')) {
        return new EntryNotFoundError('unknown');
      }
      if (error.message.includes('max retries') || error.message.includes('Max retries')) {
        return new MaxRetriesExceededError('unknown', 0, 0, error.message);
      }
      if (error.message.includes('replay') && error.message.includes('failed')) {
        return new ReplayFailedError('unknown', 'unknown', error);
      }
      if (error.message.includes('archive') && error.message.includes('failed')) {
        return new ArchiveFailedError('unknown', 'unknown', error);
      }
      if (error.message.includes('retry not allowed')) {
        return new RetryNotAllowedError('unknown', error.message);
      }
      if (error.message.includes('replay not allowed')) {
        return new ReplayNotAllowedError('unknown', error.message);
      }

      return new DeadLetterError(
        DeadLetterErrorCode.ADAPTER_OPERATION_FAILED,
        error.message,
        { originalError: error.name }
      );
    }

    return new DeadLetterError(
      DeadLetterErrorCode.ADAPTER_OPERATION_FAILED,
      'Unknown error occurred',
      { originalError: String(error) }
    );
  }
}

/**
 * Error severity levels
 */
export enum DeadLetterErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error severity mapping
 */
export const DEAD_LETTER_ERROR_SEVERITY: Record<DeadLetterErrorCode, DeadLetterErrorSeverity> = {
  [DeadLetterErrorCode.QUEUE_FULL]: DeadLetterErrorSeverity.HIGH,
  [DeadLetterErrorCode.ENTRY_NOT_FOUND]: DeadLetterErrorSeverity.MEDIUM,
  [DeadLetterErrorCode.MAX_RETRIES_EXCEEDED]: DeadLetterErrorSeverity.HIGH,
  [DeadLetterErrorCode.REPLAY_FAILED]: DeadLetterErrorSeverity.HIGH,
  [DeadLetterErrorCode.ARCHIVE_FAILED]: DeadLetterErrorSeverity.HIGH,
  [DeadLetterErrorCode.INVALID_CONFIGURATION]: DeadLetterErrorSeverity.HIGH,
  [DeadLetterErrorCode.ADAPTER_CONNECTION_FAILED]: DeadLetterErrorSeverity.CRITICAL,
  [DeadLetterErrorCode.ADAPTER_OPERATION_FAILED]: DeadLetterErrorSeverity.HIGH,
  [DeadLetterErrorCode.SERIALIZATION_FAILED]: DeadLetterErrorSeverity.MEDIUM,
  [DeadLetterErrorCode.DESERIALIZATION_FAILED]: DeadLetterErrorSeverity.MEDIUM,
  [DeadLetterErrorCode.RETRY_NOT_ALLOWED]: DeadLetterErrorSeverity.MEDIUM,
  [DeadLetterErrorCode.REPLAY_NOT_ALLOWED]: DeadLetterErrorSeverity.MEDIUM,
};

/**
 * Get error severity
 */
export function getDeadLetterErrorSeverity(code: DeadLetterErrorCode): DeadLetterErrorSeverity {
  return DEAD_LETTER_ERROR_SEVERITY[code] ?? DeadLetterErrorSeverity.MEDIUM;
}

/**
 * Check if error is retryable
 */
export function isDeadLetterErrorRetryable(code: DeadLetterErrorCode): boolean {
  return [
    DeadLetterErrorCode.ADAPTER_CONNECTION_FAILED,
    DeadLetterErrorCode.ADAPTER_OPERATION_FAILED,
    DeadLetterErrorCode.SERIALIZATION_FAILED,
    DeadLetterErrorCode.DESERIALIZATION_FAILED,
    DeadLetterErrorCode.REPLAY_FAILED,
    DeadLetterErrorCode.ARCHIVE_FAILED,
  ].includes(code);
}