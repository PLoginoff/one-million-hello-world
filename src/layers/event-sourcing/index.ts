/**
 * EventSourcing Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the EventSourcing Layer (Layer 51 of the architecture).
 */

export { IEventSourcing } from './interfaces/IEventSourcing';
export { EventSourcing } from './implementations/EventSourcing';

// Types - explicitly export to avoid conflicts
export {
  EventSourcingContext,
  EventSourcingError,
  EventSourcingResult,
  EventSourcingConfig,
  Event,
  EventStoreStats,
  EventSourcingConfiguration,
  EventSourcingEventType,
  EventAppendedPayload,
  EventReadPayload,
  SnapshotCreatedPayload,
  SnapshotLoadedPayload,
  ProjectionUpdatedPayload,
  StreamCreatedPayload,
  StreamDeletedPayload,
  ReplayStartedPayload,
  ReplayCompletedPayload,
  ReplayFailedPayload,
  ConfigChangedPayload,
  EventSourcingEventPayload,
  EventSourcingDomainEvent,
  EventSourcingStrategyContext,
  EventSourcingStrategyResult,
  IEventSourcingStrategy,
  IEventStoreAdapter,
  EventSourcingHealthStatus,
  EventSourcingHealthCheckResult,
  EventSourcingHealthCheckEntry,
  EventSourcingMetrics,
  EventSourcingPrometheusMetrics,
  EventSourcingMetricSample,
  EventSourcingErrorCode,
  EventSourcingErrorClass,
  EventSourcingProfile,
  EventSourcingProfileConfig,
  EventSourcingFactoryOptions,
  BatchAppendOptions,
  BatchAppendResult,
  ReplayOptions,
  ReplayResult,
  SnapshotPolicy,
  DEFAULT_SNAPSHOT_POLICY,
  ProjectionDefinition,
  ProjectionState,
} from './types/event-sourcing-types';

// Domain
export { EventSourcingConfigState, EventSourcingConfigStateData } from './domain/entities/EventSourcingConfigState';
export { EventSourcingEntity } from './domain/entities/EventSourcingEntity';
export { EventSourcingExecution, EventSourcingExecutionData } from './domain/entities/EventSourcingExecution';
export { EventSourcingMetricsSnapshot, EventSourcingMetricsSnapshotData } from './domain/entities/EventSourcingMetricsSnapshot';

// Configuration
export { EventSourcingConfigurationBuilder } from './configuration/builders/EventSourcingConfigurationBuilder';
export { DEFAULT_EVENTSOURCING_CONFIG } from './configuration/defaults/EventSourcingDefaults';
export { EventSourcingConfigurationValidator } from './configuration/validators/EventSourcingConfigurationValidator';

// Strategies
export { EventSourcingDefaultStrategy } from './strategies/DefaultStrategy';
export { EventSourcingFastStrategy } from './strategies/FastStrategy';
export { EventSourcingReliableStrategy } from './strategies/ReliableStrategy';
export { EventSourcingCachedStrategy } from './strategies/CachedStrategy';
export { EventSourcingBatchStrategy } from './strategies/BatchStrategy';

// Factories
export { EventSourcingStrategyFactory } from './factories/EventSourcingStrategyFactory';

// Adapters
export { EventSourcingInMemoryAdapter } from './adapters/InMemoryAdapter';
export { EventSourcingMockAdapter } from './adapters/MockAdapter';
export { EventSourcingStubAdapter } from './adapters/StubAdapter';

// Health
export { EventSourcingHealthCheck } from './health/EventSourcingHealthCheck';

// Metrics
export { EventSourcingPrometheusMetricsCollector } from './metrics/EventSourcingPrometheusMetricsCollector';

// Statistics
export { EventSourcingMetricsCollector } from './statistics/EventSourcingMetricsCollector';

// Errors
export {
  EventNotFoundError,
  AggregateNotFoundError,
  StreamNotFoundError,
  ConcurrencyConflictError,
  InvalidVersionError,
  SnapshotNotFoundError,
  ProjectionNotFoundError,
  ReplayFailedError,
  InvalidConfigurationError,
  AdapterConnectionFailedError,
  AdapterOperationFailedError,
  SerializationFailedError,
  DeserializationFailedError,
  BatchAppendFailedError,
  EventSourcingErrorFactory,
  EventSourcingErrorMapper,
  EventSourcingErrorSeverity,
  EVENT_SOURCING_ERROR_SEVERITY,
  getEventSourcingErrorSeverity,
  isEventSourcingErrorRetryable,
} from './errors';
export * from "./implementations/EventStore";
export * from "./implementations/Projection";
