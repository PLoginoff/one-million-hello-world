/**
 * EventSourcing Error Taxonomy
 *
 * Comprehensive error hierarchy for the EventSourcing Layer.
 */

import { EventSourcingErrorCode } from '../types/event-sourcing-types';

/**
 * Base error class for all event sourcing errors
 */
export class EventSourcingError extends Error {
  readonly code: EventSourcingErrorCode;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;

  constructor(code: EventSourcingErrorCode, message: string, details?: Record<string, unknown>) {
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
 * Event not found errors
 */
export class EventNotFoundError extends EventSourcingError {
  readonly eventId: string;

  constructor(eventId: string) {
    super(
      EventSourcingErrorCode.EVENT_NOT_FOUND,
      `Event not found: ${eventId}`,
      { eventId }
    );
    this.eventId = eventId;
  }
}

/**
 * Aggregate not found errors
 */
export class AggregateNotFoundError extends EventSourcingError {
  readonly aggregateId: string;
  readonly aggregateType: string;

  constructor(aggregateId: string, aggregateType: string) {
    super(
      EventSourcingErrorCode.AGGREGATE_NOT_FOUND,
      `Aggregate not found: ${aggregateId} (${aggregateType})`,
      { aggregateId, aggregateType }
    );
    this.aggregateId = aggregateId;
    this.aggregateType = aggregateType;
  }
}

/**
 * Stream not found errors
 */
export class StreamNotFoundError extends EventSourcingError {
  readonly streamId: string;

  constructor(streamId: string) {
    super(
      EventSourcingErrorCode.STREAM_NOT_FOUND,
      `Stream not found: ${streamId}`,
      { streamId }
    );
    this.streamId = streamId;
  }
}

/**
 * Concurrency conflict errors
 */
export class ConcurrencyConflictError extends EventSourcingError {
  readonly aggregateId: string;
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(aggregateId: string, expectedVersion: number, actualVersion: number) {
    super(
      EventSourcingErrorCode.CONCURRENCY_CONFLICT,
      `Concurrency conflict for aggregate ${aggregateId}: expected version ${expectedVersion}, actual ${actualVersion}`,
      { aggregateId, expectedVersion, actualVersion }
    );
    this.aggregateId = aggregateId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Invalid version errors
 */
export class InvalidVersionError extends EventSourcingError {
  readonly aggregateId: string;
  readonly providedVersion: number;
  readonly expectedVersion: number;

  constructor(aggregateId: string, providedVersion: number, expectedVersion: number) {
    super(
      EventSourcingErrorCode.INVALID_VERSION,
      `Invalid version for aggregate ${aggregateId}: provided ${providedVersion}, expected ${expectedVersion}`,
      { aggregateId, providedVersion, expectedVersion }
    );
    this.aggregateId = aggregateId;
    this.providedVersion = providedVersion;
    this.expectedVersion = expectedVersion;
  }
}

/**
 * Snapshot not found errors
 */
export class SnapshotNotFoundError extends EventSourcingError {
  readonly aggregateId: string;
  readonly aggregateType: string;

  constructor(aggregateId: string, aggregateType: string) {
    super(
      EventSourcingErrorCode.SNAPSHOT_NOT_FOUND,
      `Snapshot not found for aggregate ${aggregateId} (${aggregateType})`,
      { aggregateId, aggregateType }
    );
    this.aggregateId = aggregateId;
    this.aggregateType = aggregateType;
  }
}

/**
 * Projection not found errors
 */
export class ProjectionNotFoundError extends EventSourcingError {
  readonly projectionName: string;

  constructor(projectionName: string) {
    super(
      EventSourcingErrorCode.PROJECTION_NOT_FOUND,
      `Projection not found: ${projectionName}`,
      { projectionName }
    );
    this.projectionName = projectionName;
  }
}

/**
 * Replay failed errors
 */
export class ReplayFailedError extends EventSourcingError {
  readonly projectionName: string;
  readonly eventsProcessed: number;
  readonly originalError: Error | null;

  constructor(projectionName: string, eventsProcessed: number, originalError: Error | null = null) {
    super(
      EventSourcingErrorCode.REPLAY_FAILED,
      `Replay failed for projection ${projectionName} after ${eventsProcessed} events`,
      { projectionName, eventsProcessed, originalError: originalError?.message }
    );
    this.projectionName = projectionName;
    this.eventsProcessed = eventsProcessed;
    this.originalError = originalError;
  }
}

/**
 * Configuration errors
 */
export class InvalidConfigurationError extends EventSourcingError {
  readonly validationErrors: string[];

  constructor(validationErrors: string[]) {
    super(
      EventSourcingErrorCode.INVALID_CONFIGURATION,
      `Invalid configuration: ${validationErrors.join('; ')}`,
      { validationErrors }
    );
    this.validationErrors = validationErrors;
  }
}

/**
 * Adapter connection errors
 */
export class AdapterConnectionFailedError extends EventSourcingError {
  readonly adapterName: string;
  readonly originalError: Error | null;

  constructor(adapterName: string, originalError: Error | null = null) {
    super(
      EventSourcingErrorCode.ADAPTER_CONNECTION_FAILED,
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
export class AdapterOperationFailedError extends EventSourcingError {
  readonly adapterName: string;
  readonly operation: string;
  readonly originalError: Error | null;

  constructor(adapterName: string, operation: string, originalError: Error | null = null) {
    super(
      EventSourcingErrorCode.ADAPTER_OPERATION_FAILED,
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
export class SerializationFailedError extends EventSourcingError {
  readonly data: unknown;
  readonly originalError: Error | null;

  constructor(data: unknown, originalError: Error | null = null) {
    super(
      EventSourcingErrorCode.SERIALIZATION_FAILED,
      'Failed to serialize event',
      { data: JSON.stringify(data), originalError: originalError?.message }
    );
    this.data = data;
    this.originalError = originalError;
  }
}

/**
 * Deserialization errors
 */
export class DeserializationFailedError extends EventSourcingError {
  readonly rawData: unknown;
  readonly originalError: Error | null;

  constructor(rawData: unknown, originalError: Error | null = null) {
    super(
      EventSourcingErrorCode.DESERIALIZATION_FAILED,
      'Failed to deserialize event',
      { rawData: JSON.stringify(rawData), originalError: originalError?.message }
    );
    this.rawData = rawData;
    this.originalError = originalError;
  }
}

/**
 * Batch append errors
 */
export class BatchAppendFailedError extends EventSourcingError {
  readonly batchId: string;
  readonly appendedCount: number;
  readonly failedCount: number;
  readonly errors: Array<{ index: number; error: string }>;

  constructor(batchId: string, appendedCount: number, failedCount: number, errors: Array<{ index: number; error: string }>) {
    super(
      EventSourcingErrorCode.BATCH_APPEND_FAILED,
      `Batch append failed: ${batchId} (${appendedCount} appended, ${failedCount} failed)`,
      { batchId, appendedCount, failedCount, errors }
    );
    this.batchId = batchId;
    this.appendedCount = appendedCount;
    this.failedCount = failedCount;
    this.errors = errors;
  }
}

/**
 * Error factory for creating errors from codes
 */
export class EventSourcingErrorFactory {
  static create(code: EventSourcingErrorCode, message: string, details?: Record<string, unknown>): EventSourcingError {
    switch (code) {
      case EventSourcingErrorCode.EVENT_NOT_FOUND:
        return new EventNotFoundError(details?.eventId as string);
      case EventSourcingErrorCode.AGGREGATE_NOT_FOUND:
        return new AggregateNotFoundError(details?.aggregateId as string, details?.aggregateType as string);
      case EventSourcingErrorCode.STREAM_NOT_FOUND:
        return new StreamNotFoundError(details?.streamId as string);
      case EventSourcingErrorCode.CONCURRENCY_CONFLICT:
        return new ConcurrencyConflictError(
          details?.aggregateId as string,
          details?.expectedVersion as number,
          details?.actualVersion as number
        );
      case EventSourcingErrorCode.INVALID_VERSION:
        return new InvalidVersionError(
          details?.aggregateId as string,
          details?.providedVersion as number,
          details?.expectedVersion as number
        );
      case EventSourcingErrorCode.SNAPSHOT_NOT_FOUND:
        return new SnapshotNotFoundError(details?.aggregateId as string, details?.aggregateType as string);
      case EventSourcingErrorCode.PROJECTION_NOT_FOUND:
        return new ProjectionNotFoundError(details?.projectionName as string);
      case EventSourcingErrorCode.REPLAY_FAILED:
        return new ReplayFailedError(details?.projectionName as string, details?.eventsProcessed as number);
      case EventSourcingErrorCode.INVALID_CONFIGURATION:
        return new InvalidConfigurationError(details?.validationErrors as string[]);
      case EventSourcingErrorCode.ADAPTER_CONNECTION_FAILED:
        return new AdapterConnectionFailedError(details?.adapterName as string);
      case EventSourcingErrorCode.ADAPTER_OPERATION_FAILED:
        return new AdapterOperationFailedError(details?.adapterName as string, details?.operation as string);
      case EventSourcingErrorCode.SERIALIZATION_FAILED:
        return new SerializationFailedError(details?.data);
      case EventSourcingErrorCode.DESERIALIZATION_FAILED:
        return new DeserializationFailedError(details?.rawData);
      case EventSourcingErrorCode.BATCH_APPEND_FAILED:
        return new BatchAppendFailedError(
          details?.batchId as string,
          details?.appendedCount as number,
          details?.failedCount as number,
          details?.errors as Array<{ index: number; error: string }>
        );
      default:
        return new EventSourcingError(code, message, details);
    }
  }
}

/**
 * Error mapper for converting unknown errors to event sourcing errors
 */
export class EventSourcingErrorMapper {
  static map(error: unknown): EventSourcingError {
    if (error instanceof EventSourcingError) {
      return error;
    }

    if (error instanceof Error) {
      if (error.message.includes('not found') || error.message.includes('Not found')) {
        if (error.message.includes('aggregate') || error.message.includes('Aggregate')) {
          return new AggregateNotFoundError('unknown', 'unknown');
        }
        if (error.message.includes('stream') || error.message.includes('Stream')) {
          return new StreamNotFoundError('unknown');
        }
        if (error.message.includes('snapshot') || error.message.includes('Snapshot')) {
          return new SnapshotNotFoundError('unknown', 'unknown');
        }
        if (error.message.includes('projection') || error.message.includes('Projection')) {
          return new ProjectionNotFoundError('unknown');
        }
        return new EventNotFoundError('unknown');
      }
      if (error.message.includes('concurrency') || error.message.includes('Concurrency')) {
        return new ConcurrencyConflictError('unknown', 0, 0);
      }
      if (error.message.includes('invalid version') || error.message.includes('Invalid version')) {
        return new InvalidVersionError('unknown', 0, 0);
      }
      if (error.message.includes('replay') && error.message.includes('failed')) {
        return new ReplayFailedError('unknown', 0, error);
      }
      if (error.message.includes('batch') && error.message.includes('append') && error.message.includes('failed')) {
        return new BatchAppendFailedError('unknown', 0, 0, []);
      }

      return new EventSourcingError(
        EventSourcingErrorCode.ADAPTER_OPERATION_FAILED,
        error.message,
        { originalError: error.name }
      );
    }

    return new EventSourcingError(
      EventSourcingErrorCode.ADAPTER_OPERATION_FAILED,
      'Unknown error occurred',
      { originalError: String(error) }
    );
  }
}

/**
 * Error severity levels
 */
export enum EventSourcingErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Error severity mapping
 */
export const EVENT_SOURCING_ERROR_SEVERITY: Record<EventSourcingErrorCode, EventSourcingErrorSeverity> = {
  [EventSourcingErrorCode.EVENT_NOT_FOUND]: EventSourcingErrorSeverity.MEDIUM,
  [EventSourcingErrorCode.AGGREGATE_NOT_FOUND]: EventSourcingErrorSeverity.HIGH,
  [EventSourcingErrorCode.STREAM_NOT_FOUND]: EventSourcingErrorSeverity.HIGH,
  [EventSourcingErrorCode.CONCURRENCY_CONFLICT]: EventSourcingErrorSeverity.HIGH,
  [EventSourcingErrorCode.INVALID_VERSION]: EventSourcingErrorSeverity.HIGH,
  [EventSourcingErrorCode.SNAPSHOT_NOT_FOUND]: EventSourcingErrorSeverity.MEDIUM,
  [EventSourcingErrorCode.PROJECTION_NOT_FOUND]: EventSourcingErrorSeverity.HIGH,
  [EventSourcingErrorCode.REPLAY_FAILED]: EventSourcingErrorSeverity.HIGH,
  [EventSourcingErrorCode.INVALID_CONFIGURATION]: EventSourcingErrorSeverity.HIGH,
  [EventSourcingErrorCode.ADAPTER_CONNECTION_FAILED]: EventSourcingErrorSeverity.CRITICAL,
  [EventSourcingErrorCode.ADAPTER_OPERATION_FAILED]: EventSourcingErrorSeverity.HIGH,
  [EventSourcingErrorCode.SERIALIZATION_FAILED]: EventSourcingErrorSeverity.MEDIUM,
  [EventSourcingErrorCode.DESERIALIZATION_FAILED]: EventSourcingErrorSeverity.MEDIUM,
  [EventSourcingErrorCode.BATCH_APPEND_FAILED]: EventSourcingErrorSeverity.HIGH,
};

/**
 * Get error severity
 */
export function getEventSourcingErrorSeverity(code: EventSourcingErrorCode): EventSourcingErrorSeverity {
  return EVENT_SOURCING_ERROR_SEVERITY[code] ?? EventSourcingErrorSeverity.MEDIUM;
}

/**
 * Check if error is retryable
 */
export function isEventSourcingErrorRetryable(code: EventSourcingErrorCode): boolean {
  return [
    EventSourcingErrorCode.ADAPTER_CONNECTION_FAILED,
    EventSourcingErrorCode.ADAPTER_OPERATION_FAILED,
    EventSourcingErrorCode.SERIALIZATION_FAILED,
    EventSourcingErrorCode.DESERIALIZATION_FAILED,
    EventSourcingErrorCode.REPLAY_FAILED,
    EventSourcingErrorCode.BATCH_APPEND_FAILED,
  ].includes(code);
}