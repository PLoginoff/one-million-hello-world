/**
 * Outbox Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the Outbox Layer (Layer 56 of the architecture).
 */

export { IOutbox } from './interfaces/IOutbox';
export { Outbox } from './implementations/Outbox';

// Types (explicit to avoid duplicates across modules)
export {
  OutboxContext,
  OutboxResult,
  OutboxConfig,
  OutboxMessage,
  OutboxMessageStatus,
  OutboxStats,
  OutboxConfiguration,
  OutboxEventType,
  OutboxDomainEvent,
  OutboxStrategyContext,
  OutboxStrategyResult,
  IOutboxAdapter,
  OutboxHealthStatus,
  OutboxHealthCheckResult,
  OutboxHealthCheckEntry,
  OutboxMetrics,
  OutboxPrometheusMetrics,
  OutboxMetricSample,
  OutboxErrorCode,
  OutboxProfile,
  OutboxProfileConfig,
  OutboxFactoryOptions,
  BatchSaveOptions,
  BatchSaveResult,
  BatchProcessOptions,
  BatchProcessResult,
  RetryPolicy,
  DEFAULT_RETRY_POLICY,
  OutboxPriority,
} from './types/outbox-types';
export type { OutboxError } from './types/outbox-types';

// Domain
export { OutboxConfigState, OutboxConfigStateData } from './domain/entities/OutboxConfigState';
export { OutboxEntity } from './domain/entities/OutboxEntity';
export { OutboxExecution, OutboxExecutionData } from './domain/entities/OutboxExecution';
export { OutboxMetricsSnapshot, OutboxMetricsSnapshotData } from './domain/entities/OutboxMetricsSnapshot';
export { OutboxValueObject } from './domain/value-objects/OutboxValueObject';
export { OutboxThreshold } from './domain/value-objects/OutboxThreshold';
export { OutboxTimeWindow } from './domain/value-objects/OutboxTimeWindow';
export { OutboxDomainService } from './domain/services/OutboxDomainService';
export { OutboxExecutionService } from './domain/services/OutboxExecutionService';
export { OutboxValidationService } from './domain/services/OutboxValidationService';
export { OutboxQueryService } from './domain/services/OutboxQueryService';

// Configuration
export { OutboxConfigurationBuilder } from './configuration/builders/OutboxConfigurationBuilder';
export { OutboxConfigurationValidator, ValidationResult } from './configuration/validators/OutboxConfigurationValidator';

// Strategies
export { OutboxDefaultStrategy } from './strategies/DefaultStrategy';
export { OutboxFastStrategy } from './strategies/FastStrategy';
export { OutboxReliableStrategy } from './strategies/ReliableStrategy';
export { OutboxCachedStrategy } from './strategies/CachedStrategy';
export { OutboxBatchStrategy } from './strategies/BatchStrategy';
export type { IOutboxStrategy } from './types/outbox-types';

// Factories
export { OutboxStrategyFactory } from './factories/OutboxStrategyFactory';

// Adapters
export { OutboxInMemoryAdapter } from './adapters/InMemoryAdapter';
export { OutboxMockAdapter } from './adapters/MockAdapter';
export { OutboxStubAdapter } from './adapters/StubAdapter';

// Health
export { OutboxHealthCheck } from './health/OutboxHealthCheck';

// Metrics
export { OutboxPrometheusMetricsCollector } from './metrics/OutboxPrometheusMetricsCollector';

// Statistics
export { OutboxMetricsCollector } from './statistics/OutboxMetricsCollector';

// Errors
export {
  OutboxError as OutboxErrorClass,
  OutboxErrorFactory,
  OutboxErrorMapper,
  OutboxErrorSeverity,
  OUTBOX_ERROR_SEVERITY,
  getOutboxErrorSeverity,
  isOutboxErrorRetryable,
} from './errors/OutboxErrors';

// Utils
export { OutboxError as OutboxLegacyError } from './utils/OutboxError';
export { OutboxErrorMapper as OutboxLegacyErrorMapper, MappedOutboxError } from './utils/OutboxErrorMapper';

export * from "./implementations/TransactionalOutbox";
