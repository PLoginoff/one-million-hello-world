/**
 * EventSourcing Types
 *
 * Type definitions for the Event sourcing and event store layer.
 */

export interface EventSourcingContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface EventSourcingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface EventSourcingResult<T> {
  success: boolean;
  data?: T;
  error?: EventSourcingError;
}

export interface EventSourcingConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Event
 */
export interface Event<T = unknown> {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  version: number;
  payload: T;
  metadata: Record<string, unknown>;
  timestamp: number;
  correlationId?: string;
  causationId?: string;
}

/**
 * Event Store Statistics
 */
export interface EventStoreStats {
  totalEvents: number;
  totalAggregates: number;
  totalStreams: number;
  oldestEvent?: number;
  newestEvent?: number;
  storageSizeBytes: number;
}

/**
 * Event Sourcing Configuration
 */
export interface EventSourcingConfiguration {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  strategy: string;
  options: Record<string, unknown>;
  maxBatchSize: number;
  snapshotInterval: number;
  enableProjections: boolean;
  enableMetrics: boolean;
  enableHealthCheck: boolean;
}

/**
 * Event Sourcing Event Types
 */
export enum EventSourcingEventType {
  EVENT_APPENDED = 'event_sourcing.event_appended',
  EVENT_READ = 'event_sourcing.event_read',
  SNAPSHOT_CREATED = 'event_sourcing.snapshot_created',
  SNAPSHOT_LOADED = 'event_sourcing.snapshot_loaded',
  PROJECTION_UPDATED = 'event_sourcing.projection_updated',
  STREAM_CREATED = 'event_sourcing.stream_created',
  STREAM_DELETED = 'event_sourcing.stream_deleted',
  REPLAY_STARTED = 'event_sourcing.replay_started',
  REPLAY_COMPLETED = 'event_sourcing.replay_completed',
  REPLAY_FAILED = 'event_sourcing.replay_failed',
  CONFIG_CHANGED = 'event_sourcing.config_changed',
}

/**
 * Event Sourcing Event Payloads
 */
export interface EventAppendedPayload {
  eventId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  version: number;
  timestamp: number;
}

export interface EventReadPayload {
  eventId: string;
  aggregateId: string;
  timestamp: number;
}

export interface SnapshotCreatedPayload {
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: number;
}

export interface SnapshotLoadedPayload {
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: number;
}

export interface ProjectionUpdatedPayload {
  projectionName: string;
  eventId: string;
  timestamp: number;
}

export interface StreamCreatedPayload {
  streamId: string;
  aggregateType: string;
  timestamp: number;
}

export interface StreamDeletedPayload {
  streamId: string;
  timestamp: number;
}

export interface ReplayStartedPayload {
  projectionName: string;
  fromPosition: number;
  timestamp: number;
}

export interface ReplayCompletedPayload {
  projectionName: string;
  eventsProcessed: number;
  durationMs: number;
  timestamp: number;
}

export interface ReplayFailedPayload {
  projectionName: string;
  error: string;
  eventsProcessed: number;
  timestamp: number;
}

export interface ConfigChangedPayload {
  previousConfig: EventSourcingConfiguration;
  newConfig: EventSourcingConfiguration;
  timestamp: number;
}

export type EventSourcingEventPayload =
  | EventAppendedPayload
  | EventReadPayload
  | SnapshotCreatedPayload
  | SnapshotLoadedPayload
  | ProjectionUpdatedPayload
  | StreamCreatedPayload
  | StreamDeletedPayload
  | ReplayStartedPayload
  | ReplayCompletedPayload
  | ReplayFailedPayload
  | ConfigChangedPayload;

export interface EventSourcingDomainEvent<T extends EventSourcingEventType = EventSourcingEventType> {
  type: T;
  payload: EventSourcingEventPayload;
  timestamp: number;
  source: string;
  eventId: string;
  correlationId?: string;
}

/**
 * Event Sourcing Strategy Types
 */
export interface EventSourcingStrategyContext {
  operation: string;
  event?: Event;
  aggregateId?: string;
  batchSize: number;
  config: EventSourcingConfiguration;
}

export interface EventSourcingStrategyResult {
  success: boolean;
  data?: unknown;
  error?: EventSourcingError;
  metadata?: Record<string, unknown>;
}

export interface IEventSourcingStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: EventSourcingStrategyContext): Promise<EventSourcingStrategyResult>;
  canHandle(context: EventSourcingStrategyContext): boolean;
}

/**
 * Event Store Adapter Types
 */
export interface IEventStoreAdapter {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  appendEvent<T>(event: Event<T>): Promise<{ success: boolean; eventId?: string; error?: string }>;
  appendEvents<T>(events: Event<T>[]): Promise<{ success: boolean; eventIds?: string[]; error?: string }>;
  getEvent<T>(eventId: string): Promise<Event<T> | null>;
  getEvents(options: { aggregateId?: string; aggregateType?: string; fromVersion?: number; toVersion?: number; limit?: number }): Promise<Event[]>;
  getEventsByCorrelationId<T>(correlationId: string): Promise<Event<T>[]>;
  getEventsByCausationId<T>(causationId: string): Promise<Event<T>[]>;
  getStreamEvents<T>(streamId: string, fromVersion?: number): Promise<Event<T>[]>;
  createSnapshot(aggregateId: string, aggregateType: string, version: number, state: unknown): Promise<{ success: boolean; error?: string }>;
  getSnapshot(aggregateId: string, aggregateType: string): Promise<{ version: number; state: unknown; timestamp: number } | null>;
  deleteStream(streamId: string): Promise<{ success: boolean; error?: string }>;
  getStats(): Promise<EventStoreStats>;
}

/**
 * Event Sourcing Health Types
 */
export type EventSourcingHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface EventSourcingHealthCheckResult {
  status: EventSourcingHealthStatus;
  timestamp: number;
  checks: EventSourcingHealthCheckEntry[];
  summary: string;
}

export interface EventSourcingHealthCheckEntry {
  name: string;
  status: EventSourcingHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Event Sourcing Metrics Types
 */
export interface EventSourcingMetrics {
  totalEvents: number;
  appendedCount: number;
  readCount: number;
  snapshotsCreated: number;
  snapshotsLoaded: number;
  projectionsUpdated: number;
  replaysCompleted: number;
  replaysFailed: number;
  averageAppendTime: number;
  averageReadTime: number;
}

/**
 * Event Sourcing Prometheus Metrics
 */
export interface EventSourcingPrometheusMetrics {
  event_sourcing_events_total: number;
  event_sourcing_appended_total: number;
  event_sourcing_read_total: number;
  event_sourcing_snapshots_created_total: number;
  event_sourcing_snapshots_loaded_total: number;
  event_sourcing_projections_updated_total: number;
  event_sourcing_replays_completed_total: number;
  event_sourcing_replays_failed_total: number;
  event_sourcing_avg_append_time_ms: number;
  event_sourcing_avg_read_time_ms: number;
  collectedAt: number;
}

export interface EventSourcingMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Event Sourcing Error Codes
 */
export enum EventSourcingErrorCode {
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
  AGGREGATE_NOT_FOUND = 'AGGREGATE_NOT_FOUND',
  STREAM_NOT_FOUND = 'STREAM_NOT_FOUND',
  CONCURRENCY_CONFLICT = 'CONCURRENCY_CONFLICT',
  INVALID_VERSION = 'INVALID_VERSION',
  SNAPSHOT_NOT_FOUND = 'SNAPSHOT_NOT_FOUND',
  PROJECTION_NOT_FOUND = 'PROJECTION_NOT_FOUND',
  REPLAY_FAILED = 'REPLAY_FAILED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  ADAPTER_CONNECTION_FAILED = 'ADAPTER_CONNECTION_FAILED',
  ADAPTER_OPERATION_FAILED = 'ADAPTER_OPERATION_FAILED',
  SERIALIZATION_FAILED = 'SERIALIZATION_FAILED',
  DESERIALIZATION_FAILED = 'DESERIALIZATION_FAILED',
  BATCH_APPEND_FAILED = 'BATCH_APPEND_FAILED',
}

/**
 * Event Sourcing Error Class
 */
export class EventSourcingErrorClass extends Error {
  readonly code: EventSourcingErrorCode;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;

  constructor(code: EventSourcingErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EventSourcingError';
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
 * Event Sourcing Configuration Profiles
 */
export type EventSourcingProfile = 'development' | 'staging' | 'production' | 'test';

export interface EventSourcingProfileConfig {
  profile: EventSourcingProfile;
  config: EventSourcingConfiguration;
}

/**
 * Event Sourcing Factory Types
 */
export interface EventSourcingFactoryOptions {
  profile?: EventSourcingProfile;
  logger?: unknown;
  metricsCollector?: unknown;
  healthCheck?: unknown;
  adapter?: IEventStoreAdapter;
}

/**
 * Event Sourcing Batch Operations
 */
export interface BatchAppendOptions {
  events: Array<Omit<Event, 'id' | 'timestamp'>>;
  stopOnError?: boolean;
}

export interface BatchAppendResult {
  success: boolean;
  results: Array<{ success: boolean; eventId?: string; error?: string }>;
  errors: Array<{ index: number; error: string }>;
}

/**
 * Event Sourcing Replay Options
 */
export interface ReplayOptions {
  projectionName: string;
  fromPosition?: number;
  toPosition?: number;
  batchSize?: number;
  concurrency?: number;
}

export interface ReplayResult {
  success: boolean;
  eventsProcessed: number;
  durationMs: number;
  errors: Array<{ eventId: string; error: string }>;
}

/**
 * Event Sourcing Snapshot Policy
 */
export interface SnapshotPolicy {
  interval: number;
  maxSnapshots: number;
  retentionDays: number;
}

export const DEFAULT_SNAPSHOT_POLICY: SnapshotPolicy = {
  interval: 100,
  maxSnapshots: 10,
  retentionDays: 30,
};

/**
 * Event Sourcing Projection Types
 */
export interface ProjectionDefinition {
  name: string;
  handler: (event: Event) => Promise<void>;
  initialState: unknown;
  eventTypes: string[];
}

export interface ProjectionState {
  name: string;
  state: unknown;
  lastProcessedPosition: number;
  lastUpdated: number;
  status: 'running' | 'stopped' | 'error';
  error?: string;
}