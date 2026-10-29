/**
 * Event Errors
 *
 * Comprehensive error hierarchy for the event layer.
 * Provides structured error information with error codes and context.
 *
 * @module EventLayer/Errors
 */

/**
 * Base error class for event system errors.
 */
export abstract class EventError extends Error {
  /** Unique error code for programmatic handling */
  public readonly code: string;

  /** Additional context data for debugging */
  public readonly context: Record<string, unknown>;

  /** Timestamp when the error occurred */
  public readonly timestamp: number;

  /**
   * Creates a new EventError.
   *
   * @param code - Unique error code
   * @param message - Human-readable error message
   * @param context - Additional context data
   */
  constructor(code: string, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.timestamp = Date.now();

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts the error to a JSON-serializable object.
   *
   * @returns Error data as plain object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * Creates a new error with additional context.
   *
   * @param additionalContext - Additional context to merge
   * @returns New error instance with merged context
   */
  withContext(additionalContext: Record<string, unknown>): EventError {
    const newError = Object.create(Object.getPrototypeOf(this));
    // Copy all own properties (including non-enumerable ones like message)
    const props = Object.getOwnPropertyDescriptors(this);
    Object.defineProperties(newError, props);
    newError.context = { ...this.context, ...additionalContext };
    return newError;
  }
}

/**
 * Error thrown when event publishing fails.
 */
export class EventPublishError extends EventError {
  /** The event name that failed to publish */
  public readonly eventName: string;

  /** The event payload that failed to publish */
  public readonly payload: unknown;

  /**
   * Creates a new EventPublishError.
   *
   * @param eventName - The event name
   * @param payload - The event payload
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(eventName: string, payload: unknown, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_PUBLISH_ERROR', message, { ...context, eventName, payload });
    this.eventName = eventName;
    this.payload = payload;
  }
}

/**
 * Error thrown when event subscription fails.
 */
export class EventSubscribeError extends EventError {
  /** The event name that failed to subscribe */
  public readonly eventName: string;

  /** The subscription ID if available */
  public readonly subscriptionId?: string;

  /**
   * Creates a new EventSubscribeError.
   *
   * @param eventName - The event name
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(eventName: string, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_SUBSCRIBE_ERROR', message, { ...context, eventName });
    this.eventName = eventName;
    this.subscriptionId = context.subscriptionId as string | undefined;
  }
}

/**
 * Error thrown when event serialization fails.
 */
export class EventSerializationError extends EventError {
  /** The event name that failed to serialize */
  public readonly eventName: string;

  /** The event payload that failed to serialize */
  public readonly payload: unknown;

  /** The serialization format that was attempted */
  public readonly format: string;

  /**
   * Creates a new EventSerializationError.
   *
   * @param eventName - The event name
   * @param payload - The event payload
   * @param format - The serialization format
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(eventName: string, payload: unknown, format: string, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_SERIALIZATION_ERROR', message, { ...context, eventName, payload, format });
    this.eventName = eventName;
    this.payload = payload;
    this.format = format;
  }
}

/**
 * Error thrown when event handler execution fails.
 */
export class EventHandlerError extends EventError {
  /** The event name being handled */
  public readonly eventName: string;

  /** The subscription ID if available */
  public readonly subscriptionId?: string;

  /** The original error that caused the handler to fail */
  public readonly originalError: Error;

  /**
   * Creates a new EventHandlerError.
   *
   * @param eventName - The event name
   * @param originalError - The original error
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(eventName: string, originalError: Error, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_HANDLER_ERROR', message, { ...context, eventName, originalError: originalError.message });
    this.eventName = eventName;
    this.subscriptionId = context.subscriptionId as string | undefined;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when event queue is full.
 */
export class EventQueueFullError extends EventError {
  /** The event name that was being published */
  public readonly eventName: string;

  /** The current queue size */
  public readonly queueSize: number;

  /** The maximum queue size */
  public readonly maxQueueSize: number;

  /**
   * Creates a new EventQueueFullError.
   *
   * @param eventName - The event name
   * @param queueSize - Current queue size
   * @param maxQueueSize - Maximum queue size
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(eventName: string, queueSize: number, maxQueueSize: number, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_QUEUE_FULL', message, { ...context, eventName, queueSize, maxQueueSize });
    this.eventName = eventName;
    this.queueSize = queueSize;
    this.maxQueueSize = maxQueueSize;
  }
}

/**
 * Error thrown when event delivery times out.
 */
export class EventDeliveryTimeoutError extends EventError {
  /** The event name that timed out */
  public readonly eventName: string;

  /** The timeout duration in milliseconds */
  public readonly timeoutMs: number;

  /** The subscription ID if available */
  public readonly subscriptionId?: string;

  /**
   * Creates a new EventDeliveryTimeoutError.
   *
   * @param eventName - The event name
   * @param timeoutMs - Timeout duration
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(eventName: string, timeoutMs: number, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_DELIVERY_TIMEOUT', message, { ...context, eventName, timeoutMs });
    this.eventName = eventName;
    this.timeoutMs = timeoutMs;
    this.subscriptionId = context.subscriptionId as string | undefined;
  }
}

/**
 * Error thrown when event adapter is not connected.
 */
export class EventAdapterNotConnectedError extends EventError {
  /** The adapter type */
  public readonly adapterType: string;

  /** The adapter name/identifier */
  public readonly adapterName: string;

  /**
   * Creates a new EventAdapterNotConnectedError.
   *
   * @param adapterType - The adapter type
   * @param adapterName - The adapter name
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(adapterType: string, adapterName: string, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_ADAPTER_NOT_CONNECTED', message, { ...context, adapterType, adapterName });
    this.adapterType = adapterType;
    this.adapterName = adapterName;
  }
}

/**
 * Error thrown when event adapter connection fails.
 */
export class EventAdapterConnectionError extends EventError {
  /** The adapter type */
  public readonly adapterType: string;

  /** The adapter name/identifier */
  public readonly adapterName: string;

  /** The original connection error */
  public readonly originalError: Error;

  /**
   * Creates a new EventAdapterConnectionError.
   *
   * @param adapterType - The adapter type
   * @param adapterName - The adapter name
   * @param originalError - The original error
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(adapterType: string, adapterName: string, originalError: Error, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_ADAPTER_CONNECTION_ERROR', message, { ...context, adapterType, adapterName, originalError: originalError.message });
    this.adapterType = adapterType;
    this.adapterName = adapterName;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when event configuration is invalid.
 */
export class EventConfigurationError extends EventError {
  /** The configuration field that is invalid */
  public readonly field: string;

  /** The invalid value */
  public readonly value: unknown;

  /**
   * Creates a new EventConfigurationError.
   *
   * @param field - The invalid field
   * @param value - The invalid value
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(field: string, value: unknown, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_CONFIGURATION_ERROR', message, { ...context, field, value });
    this.field = field;
    this.value = value;
  }
}

/**
 * Error thrown when event strategy execution fails.
 */
export class EventStrategyError extends EventError {
  /** The strategy name */
  public readonly strategyName: string;

  /** The operation that failed */
  public readonly operation: string;

  /** The event name */
  public readonly eventName: string;

  /**
   * Creates a new EventStrategyError.
   *
   * @param strategyName - The strategy name
   * @param operation - The operation
   * @param eventName - The event name
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(strategyName: string, operation: string, eventName: string, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_STRATEGY_ERROR', message, { ...context, strategyName, operation, eventName });
    this.strategyName = strategyName;
    this.operation = operation;
    this.eventName = eventName;
  }
}

/**
 * Error thrown when dead letter queue is full.
 */
export class EventDeadLetterQueueFullError extends EventError {
  /** The event name that failed */
  public readonly eventName: string;

  /** The current queue size */
  public readonly queueSize: number;

  /** The maximum queue size */
  public readonly maxQueueSize: number;

  /**
   * Creates a new EventDeadLetterQueueFullError.
   *
   * @param eventName - The event name
   * @param queueSize - Current queue size
   * @param maxQueueSize - Maximum queue size
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(eventName: string, queueSize: number, maxQueueSize: number, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_DEAD_LETTER_QUEUE_FULL', message, { ...context, eventName, queueSize, maxQueueSize });
    this.eventName = eventName;
    this.queueSize = queueSize;
    this.maxQueueSize = maxQueueSize;
  }
}

/**
 * Error thrown when event replay fails.
 */
export class EventReplayError extends EventError {
  /** The dead letter entry ID */
  public readonly entryId: string;

  /** The event name */
  public readonly eventName: string;

  /** The original error */
  public readonly originalError: Error;

  /**
   * Creates a new EventReplayError.
   *
   * @param entryId - The dead letter entry ID
   * @param eventName - The event name
   * @param originalError - The original error
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(entryId: string, eventName: string, originalError: Error, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_REPLAY_ERROR', message, { ...context, entryId, eventName, originalError: originalError.message });
    this.entryId = entryId;
    this.eventName = eventName;
    this.originalError = originalError;
  }
}

/**
 * Error thrown when event filter rejects an event.
 */
export class EventFilteredError extends EventError {
  /** The event name that was filtered */
  public readonly eventName: string;

  /** The filter rule ID that rejected the event */
  public readonly ruleId: string;

  /** The filter action */
  public readonly action: string;

  /**
   * Creates a new EventFilteredError.
   *
   * @param eventName - The event name
   * @param ruleId - The filter rule ID
   * @param action - The filter action
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(eventName: string, ruleId: string, action: string, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_FILTERED', message, { ...context, eventName, ruleId, action });
    this.eventName = eventName;
    this.ruleId = ruleId;
    this.action = action;
  }
}

/**
 * Error thrown when event priority queue is full.
 */
export class EventPriorityQueueFullError extends EventError {
  /** The event priority */
  public readonly priority: number;

  /** The current queue size for this priority */
  public readonly queueSize: number;

  /** The maximum queue size for this priority */
  public readonly maxQueueSize: number;

  /**
   * Creates a new EventPriorityQueueFullError.
   *
   * @param priority - The event priority
   * @param queueSize - Current queue size
   * @param maxQueueSize - Maximum queue size
   * @param message - Error message
   * @param context - Additional context
   */
  constructor(priority: number, queueSize: number, maxQueueSize: number, message: string, context: Record<string, unknown> = {}) {
    super('EVENT_PRIORITY_QUEUE_FULL', message, { ...context, priority, queueSize, maxQueueSize });
    this.priority = priority;
    this.queueSize = queueSize;
    this.maxQueueSize = maxQueueSize;
  }
}

/**
 * Checks if an error is an EventError.
 *
 * @param error - The error to check
 * @returns True if the error is an EventError
 */
export function isEventError(error: unknown): error is EventError {
  return error instanceof EventError;
}

/**
 * Gets the error code from an error (EventError or generic Error).
 *
 * @param error - The error
 * @returns The error code or 'UNKNOWN_ERROR'
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof EventError) {
    return error.code;
  }
  if (error instanceof Error) {
    const name = error.name;
    // Convert 'Error' -> 'ERROR_ERROR', 'TypeError' -> 'TYPE_ERROR', etc.
    if (name === 'Error') return 'ERROR_ERROR';
    return name.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, '');
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Gets the error message from an error.
 *
 * @param error - The error
 * @returns The error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}