/**
 * Inbox Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Inbox Layer (Layer 57 of the architecture).
 */

export { IInbox } from './interfaces/IInbox';
export { Inbox } from './implementations/Inbox';

// Types (explicit to avoid duplicates across modules)
export {
  InboxContext,
  InboxResult,
  InboxConfig,
  InboxMessage,
  InboxMessageStatus,
  InboxStats,
  InboxConfiguration,
  InboxEventType,
  MessageReceivedPayload,
  MessageProcessingPayload,
  MessageProcessedPayload,
  MessageFailedPayload,
  MessageRetriedPayload,
  MessageDuplicatePayload,
  MessageArchivedPayload,
  BatchProcessedPayload,
  ConfigChangedPayload,
  DeduplicationCleanupPayload,
  InboxEventPayload,
  InboxDomainEvent,
  InboxStrategyContext,
  InboxStrategyResult,
  IInboxAdapter,
  InboxHealthStatus,
  InboxHealthCheckResult,
  InboxHealthCheckEntry,
  InboxMetrics,
  InboxPrometheusMetrics,
  InboxMetricSample,
  InboxErrorCode,
  InboxProfile,
  InboxProfileConfig,
  InboxFactoryOptions,
  BatchReceiveOptions,
  BatchReceiveResult,
  BatchProcessOptions,
  BatchProcessResult,
  RetryPolicy,
  DEFAULT_RETRY_POLICY,
  DeduplicationEntry,
  DeduplicationStats,
} from './types/inbox-types';
export type { InboxError } from './types/inbox-types';

// Domain
export { InboxMetricsSnapshot, InboxMetricsSnapshotData } from './domain/entities/InboxMetricsSnapshot';

// Configuration
export { InboxConfigurationBuilder } from './configuration/builders/InboxConfigurationBuilder';
export { InboxConfigurationValidator, ValidationResult } from './configuration/validators/InboxConfigurationValidator';

// Strategies (type-only for IInboxStrategy to avoid collision)
export { DefaultInboxStrategy, OptimizedInboxStrategy, FallbackInboxStrategy } from './strategies/InboxStrategy';
export { InboxBatchStrategy } from './strategies/BatchStrategy';
export { InboxCachedStrategy } from './strategies/CachedStrategy';
export { InboxDefaultStrategy } from './strategies/DefaultStrategy';
export { InboxFastStrategy } from './strategies/FastStrategy';
export { InboxReliableStrategy } from './strategies/ReliableStrategy';
export type { IInboxStrategy } from './types/inbox-types';

// Factories
export { InboxStrategyFactory } from './factories/InboxStrategyFactory';

// Adapters
export { InboxInMemoryAdapter } from './adapters/InMemoryAdapter';
export { InboxMockAdapter } from './adapters/MockAdapter';
export { InboxStubAdapter } from './adapters/StubAdapter';

// Health
export { InboxHealthCheck } from './health/InboxHealthCheck';

// Metrics
export { InboxPrometheusMetricsCollector } from './metrics/InboxPrometheusMetricsCollector';

// Statistics
export { InboxMetricsCollector } from './statistics/InboxMetricsCollector';

// Errors
export {
  InboxError as InboxErrorClass,
  MessageNotFoundError,
  DuplicateMessageError,
  MaxRetriesExceededError,
  MessageAlreadyProcessedError,
  InvalidConfigurationError,
  AdapterConnectionFailedError,
  AdapterOperationFailedError,
  SerializationFailedError,
  DeserializationFailedError,
  BatchProcessingFailedError,
  DeduplicationFailedError,
  InboxErrorFactory,
  InboxErrorMapper,
  InboxErrorSeverity,
  INBOX_ERROR_SEVERITY,
  getInboxErrorSeverity,
  isInboxErrorRetryable,
} from './errors/InboxErrors';

// Utils
export { InboxError as InboxLegacyError } from './utils/InboxError';
export { InboxErrorMapper as InboxLegacyErrorMapper, MappedInboxError } from './utils/InboxErrorMapper';

// Pattern (real inbox engine)
export * from './pattern';

// Engine2 (deeper capabilities)
export * from "./engine2";
