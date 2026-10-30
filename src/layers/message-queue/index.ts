/**
 * Message Queue Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Message Queue Layer (Layer 14 of the 25-layer architecture).
 *
 * The Message Queue Layer provides async processing
 * and dead letter queues.
 *
 * @module MessageQueueLayer
 */

export { IMessageQueue, MessageHandler } from './interfaces/IMessageQueue';
export { MessageQueue } from './implementations/MessageQueue';

// Types (explicit to avoid duplicates)
export {
  Message,
  QueueStats,
  MessageQueueResult,
  MessageQueueError,
  MessageQueueErrorCode,
  MessageQueueErrorClass,
  MessageQueuePriority,
  MessageQueueConfiguration,
  MessageQueueProfile,
  MessageQueueProfileConfig,
  MessageQueueFactoryOptions,
  BatchEnqueueOptions,
  BatchEnqueueResult,
  DelayedMessageOptions,
  ScheduledMessageOptions,
  RetryPolicy,
  DEFAULT_RETRY_POLICY,
  DeadLetterEntry,
  DeadLetterQueueStats,
  IMessageQueueAdapter,
  MessageQueueHealthStatus,
  MessageQueueHealthCheckResult,
  MessageQueueHealthCheckEntry,
  MessageQueueMetrics,
  MessageQueuePrometheusMetrics,
  MessageQueueMetricSample,
  IMessageQueueStrategy,
  MessageQueueStrategyContext,
  MessageQueueStrategyResult,
  MessageQueueEventType,
  MessageQueueDomainEvent,
} from './types/message-queue-types';

// Domain (explicit, skip value-objects and handlers that collide with types)
export { MessageQueueConfigState, MessageQueueConfigStateData } from './domain/entities/MessageQueueConfigState';
export { MessageQueueExecution, MessageQueueExecutionData } from './domain/entities/MessageQueueExecution';
export { MessageQueueMetricsSnapshot, MessageQueueMetricsSnapshotData } from './domain/entities/MessageQueueMetricsSnapshot';
export { MessageQueueThreshold } from './domain/value-objects/MessageQueueThreshold';
export { MessageQueueTimeWindow } from './domain/value-objects/MessageQueueTimeWindow';
export { MessageQueueExecutionService } from './domain/services/MessageQueueExecutionService';
export { MessageQueueValidationService } from './domain/services/MessageQueueValidationService';
export { MessageQueueQueryService } from './domain/services/MessageQueueQueryService';

// Configuration
export { MessageQueueConfigurationBuilder } from './configuration/builders/MessageQueueConfigurationBuilder';
export { MessageQueueConfigurationValidator, ValidationResult } from './configuration/validators/MessageQueueConfigurationValidator';

// Strategies
export { MessageQueueDefaultStrategy } from './strategies/DefaultStrategy';
export { MessageQueueFastStrategy } from './strategies/FastStrategy';
export { MessageQueueReliableStrategy } from './strategies/ReliableStrategy';
export { MessageQueueCachedStrategy } from './strategies/CachedStrategy';
export { MessageQueueBatchStrategy } from './strategies/BatchStrategy';

// Factories
export { MessageQueueStrategyFactory, MessageQueueFactory } from './factories/MessageQueueStrategyFactory';

// Adapters
export { InMemoryQueueAdapter } from './adapters/InMemoryQueueAdapter';
export { RedisQueueAdapter } from './adapters/RedisQueueAdapter';

// Health
export { MessageQueueHealthCheck } from './health/MessageQueueHealthCheck';

// Metrics
export { MessageQueuePrometheusMetricsCollector } from './metrics/MessageQueuePrometheusMetricsCollector';

// Statistics
export { MessageQueueMetricsCollector } from './statistics/MessageQueueMetricsCollector';

// Errors
export {
  QueueFullError,
  MessageNotFoundError,
  MaxRetriesExceededError,
  HandlerNotRegisteredError,
  QueueNotRunningError,
  InvalidConfigurationError,
  AdapterConnectionFailedError,
  AdapterOperationFailedError,
  SerializationFailedError,
  DeserializationFailedError,
  MessageQueueErrorFactory,
  MessageQueueErrorMapper as MessageQueueErrorMapperClass,
  MessageQueueErrorSeverity,
  MESSAGE_QUEUE_ERROR_SEVERITY,
  getMessageQueueErrorSeverity,
  isMessageQueueErrorRetryable,
} from './errors/MessageQueueErrors';
export { MessageQueueError as MessageQueueErrorBase } from './errors/MessageQueueErrors';

// Utils
export { MessageQueueError as MessageQueueLegacyError } from './utils/MessageQueueError';
export { MessageQueueErrorMapper as MessageQueueUtilsErrorMapper, MappedMessageQueueError } from './utils/MessageQueueErrorMapper';

// Engine Layer (priority heap, delay scheduler, at-least-once leasing,
// consumer groups, dead-letter policies, depth/backpressure metrics)
export * from './engine';
