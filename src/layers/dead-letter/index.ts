/**
 * DeadLetter Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the DeadLetter Layer (Layer 58 of the architecture).
 */

export { IDeadLetter } from './interfaces/IDeadLetter';
export { DeadLetter } from './implementations/DeadLetter';

// Types - explicitly export to avoid conflicts
export {
  DeadLetterContext,
  DeadLetterError,
  DeadLetterResult,
  DeadLetterConfig,
  DeadLetterEntry,
  DeadLetterQueueStats,
  DeadLetterConfiguration,
  DeadLetterEventType,
  MessageAddedPayload,
  MessageRetriedPayload,
  MessageReplayedPayload,
  MessageDiscardedPayload,
  MessageArchivedPayload,
  QueueClearedPayload,
  ConfigChangedPayload,
  RetryPolicyChangedPayload,
  DeadLetterEventPayload,
  DeadLetterDomainEvent,
  DeadLetterStrategyContext,
  DeadLetterStrategyResult,
  IDeadLetterStrategy,
  IDeadLetterAdapter,
  DeadLetterHealthStatus,
  DeadLetterHealthCheckResult,
  DeadLetterHealthCheckEntry,
  DeadLetterMetrics,
  DeadLetterPrometheusMetrics,
  DeadLetterMetricSample,
  DeadLetterErrorCode,
  DeadLetterErrorClass,
  DeadLetterProfile,
  DeadLetterProfileConfig,
  DeadLetterFactoryOptions,
  RetryPolicy,
  DEFAULT_RETRY_POLICY,
  ReplayOptions,
  ArchiveOptions,
  BatchRetryOptions,
  BatchRetryResult,
  BatchReplayOptions,
  BatchReplayResult,
  BatchDiscardOptions,
  BatchDiscardResult,
} from './types/dead-letter-types';

// Domain
export { DeadLetterEntity } from './domain/entities/DeadLetterEntity';
export { DeadLetterConfigState, DeadLetterConfigStateData } from './domain/entities/DeadLetterConfigState';
export { DeadLetterExecution, DeadLetterExecutionData } from './domain/entities/DeadLetterExecution';
export { DeadLetterMetricsSnapshot, DeadLetterMetricsSnapshotData } from './domain/entities/DeadLetterMetricsSnapshot';

// Configuration
export { DeadLetterConfigurationBuilder } from './configuration/builders/DeadLetterConfigurationBuilder';
export { DEFAULT_DEADLETTER_CONFIG } from './configuration/defaults/DeadLetterDefaults';
export { DeadLetterConfigurationValidator } from './configuration/validators/DeadLetterConfigurationValidator';

// Strategies
export { DeadLetterDefaultStrategy } from './strategies/DefaultStrategy';
export { DeadLetterFastStrategy } from './strategies/FastStrategy';
export { DeadLetterReliableStrategy } from './strategies/ReliableStrategy';
export { DeadLetterCachedStrategy } from './strategies/CachedStrategy';
export { DeadLetterBatchStrategy } from './strategies/BatchStrategy';

// Factories
export { DeadLetterFactory } from './factories/DeadLetterFactory';
export { DeadLetterStrategyFactory } from './factories/DeadLetterStrategyFactory';

// Adapters
export { DeadLetterInMemoryAdapter } from './adapters/InMemoryAdapter';
export { DeadLetterMockAdapter } from './adapters/MockAdapter';
export { DeadLetterStubAdapter } from './adapters/StubAdapter';

// Health
export { DeadLetterHealthCheck } from './health/DeadLetterHealthCheck';

// Metrics
export { DeadLetterPrometheusMetricsCollector } from './metrics/DeadLetterPrometheusMetricsCollector';

// Statistics
export { DeadLetterMetricsCollector } from './statistics/DeadLetterMetricsCollector';

// Errors
export {
  QueueFullError,
  EntryNotFoundError,
  MaxRetriesExceededError,
  ReplayFailedError,
  ArchiveFailedError,
  InvalidConfigurationError,
  AdapterConnectionFailedError,
  AdapterOperationFailedError,
  SerializationFailedError,
  DeserializationFailedError,
  RetryNotAllowedError,
  ReplayNotAllowedError,
  DeadLetterErrorFactory,
  DeadLetterErrorMapper,
  DeadLetterErrorSeverity,
  DEAD_LETTER_ERROR_SEVERITY,
  getDeadLetterErrorSeverity,
  isDeadLetterErrorRetryable,
} from './errors';