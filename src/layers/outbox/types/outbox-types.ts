/**
 * Outbox Types
 *
 * Type definitions for the Transactional outbox pattern layer.
 */

export interface OutboxContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface OutboxError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface OutboxResult<T> {
  success: boolean;
  data?: T;
  error?: OutboxError;
}

export interface OutboxConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Outbox Message
 */
export interface OutboxMessage<T = unknown> {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: T;
  metadata: Record<string, unknown>;
  createdAt: number;
  processedAt?: number;
  retryCount: number;
  maxRetries: number;
  status: OutboxMessageStatus;
}

/**
 * Outbox Message Status
 */
export enum OutboxMessageStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
  ARCHIVED = 'archived',
}

/**
 * Outbox Statistics
 */
export interface OutboxStats {
  pendingCount: number;
  processingCount: number;
  processedCount: number;
  failedCount: number;
  archivedCount: number;
  totalCount: number;
}

/**
 * Outbox Configuration
 */
export interface OutboxConfiguration {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  strategy: string;
  options: Record<string, unknown>;
  maxBatchSize: number;
  pollIntervalMs: number;
  retentionDays: number;
  enableMetrics: boolean;
  enableHealthCheck: boolean;
}

/**
 * Outbox Event Types
 */
export enum OutboxEventType {
  MESSAGE_CREATED = 'outbox.message_created',
  MESSAGE_PROCESSING = 'outbox.message_processing',
  MESSAGE_PROCESSED = 'outbox.message_processed',
  MESSAGE_FAILED = 'outbox.message_failed',
  MESSAGE_RETRIED = 'outbox.message_retried',
  MESSAGE_ARCHIVED = 'outbox.message_archived',
  BATCH_PROCESSED = 'outbox.batch_processed',
  CONFIG_CHANGED = 'outbox.config_changed',
}

/**
 * Outbox Event Payloads
 */
export interface MessageCreatedPayload {
  messageId: string;
  aggregateId: string;
  eventType: string;
  timestamp: number;
}

export interface MessageProcessingPayload {
  messageId: string;
  attempt: number;
  timestamp: number;
}

export interface MessageProcessedPayload {
  messageId: string;
  durationMs: number;
  timestamp: number;
}

export interface MessageFailedPayload {
  messageId: string;
  error: string;
  retryCount: number;
  maxRetries: number;
  willRetry: boolean;
  timestamp: number;
}

export interface MessageRetriedPayload {
  messageId: string;
  attempt: number;
  nextRetryAt: number;
  timestamp: number;
}

export interface MessageArchivedPayload {
  messageId: string;
  archiveLocation: string;
  timestamp: number;
}

export interface BatchProcessedPayload {
  batchSize: number;
  successCount: number;
  failureCount: number;
  durationMs: number;
  timestamp: number;
}

export interface ConfigChangedPayload {
  previousConfig: OutboxConfiguration;
  newConfig: OutboxConfiguration;
  timestamp: number;
}

export type OutboxEventPayload =
  | MessageCreatedPayload
  | MessageProcessingPayload
  | MessageProcessedPayload
  | MessageFailedPayload
  | MessageRetriedPayload
  | MessageArchivedPayload
  | BatchProcessedPayload
  | ConfigChangedPayload;

export interface OutboxDomainEvent<T extends OutboxEventType = OutboxEventType> {
  type: T;
  payload: OutboxEventPayload;
  timestamp: number;
  source: string;
  eventId: string;
  correlationId?: string;
}

/**
 * Outbox Strategy Types
 */
export interface OutboxStrategyContext {
  operation: string;
  message?: OutboxMessage;
  batchSize: number;
  config: OutboxConfiguration;
}

export interface OutboxStrategyResult {
  success: boolean;
  data?: unknown;
  error?: OutboxError;
  metadata?: Record<string, unknown>;
}

export interface IOutboxStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: OutboxStrategyContext): Promise<OutboxStrategyResult>;
  canHandle(context: OutboxStrategyContext): boolean;
}

/**
 * Outbox Adapter Types
 */
export interface IOutboxAdapter {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  saveMessage<T>(message: OutboxMessage<T>): Promise<{ success: boolean; messageId?: string; error?: string }>;
  getMessage<T>(messageId: string): Promise<OutboxMessage<T> | null>;
  getMessages(options?: { status?: OutboxMessageStatus; limit?: number; offset?: number }): Promise<OutboxMessage[]>;
  updateMessage(messageId: string, updates: Partial<OutboxMessage>): Promise<{ success: boolean; error?: string }>;
  markProcessed(messageId: string): Promise<{ success: boolean; error?: string }>;
  markFailed(messageId: string, error: string): Promise<{ success: boolean; error?: string }>;
  archiveMessage(messageId: string): Promise<{ success: boolean; error?: string }>;
  getStats(): Promise<OutboxStats>;
  clear(): Promise<void>;
}

/**
 * Outbox Health Types
 */
export type OutboxHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface OutboxHealthCheckResult {
  status: OutboxHealthStatus;
  timestamp: number;
  checks: OutboxHealthCheckEntry[];
  summary: string;
}

export interface OutboxHealthCheckEntry {
  name: string;
  status: OutboxHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Outbox Metrics Types
 */
export interface OutboxMetrics {
  totalMessages: number;
  processedCount: number;
  failedCount: number;
  averageProcessingTime: number;
  pendingCount: number;
  processingCount: number;
}

/**
 * Outbox Prometheus Metrics
 */
export interface OutboxPrometheusMetrics {
  outbox_messages_total: number;
  outbox_processed_total: number;
  outbox_failed_total: number;
  outbox_avg_processing_time_ms: number;
  outbox_pending_count: number;
  outbox_processing_count: number;
  collectedAt: number;
}

export interface OutboxMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Outbox Error Codes
 */
export enum OutboxErrorCode {
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  MESSAGE_ALREADY_PROCESSED = 'MESSAGE_ALREADY_PROCESSED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  ADAPTER_CONNECTION_FAILED = 'ADAPTER_CONNECTION_FAILED',
  ADAPTER_OPERATION_FAILED = 'ADAPTER_OPERATION_FAILED',
  SERIALIZATION_FAILED = 'SERIALIZATION_FAILED',
  DESERIALIZATION_FAILED = 'DESERIALIZATION_FAILED',
  BATCH_PROCESSING_FAILED = 'BATCH_PROCESSING_FAILED',
}

/**
 * Outbox Error Class
 */
export class OutboxErrorClass extends Error {
  readonly code: OutboxErrorCode;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;

  constructor(code: OutboxErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'OutboxError';
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
 * Outbox Configuration Profiles
 */
export type OutboxProfile = 'development' | 'staging' | 'production' | 'test';

export interface OutboxProfileConfig {
  profile: OutboxProfile;
  config: OutboxConfiguration;
}

/**
 * Outbox Factory Types
 */
export interface OutboxFactoryOptions {
  profile?: OutboxProfile;
  logger?: unknown;
  metricsCollector?: unknown;
  healthCheck?: unknown;
  adapter?: IOutboxAdapter;
}

/**
 * Outbox Batch Operations
 */
export interface BatchSaveOptions {
  messages: Array<Omit<OutboxMessage, 'id' | 'createdAt' | 'retryCount' | 'status'>>;
  stopOnError?: boolean;
}

export interface BatchSaveResult {
  success: boolean;
  results: Array<{ success: boolean; messageId?: string; error?: string }>;
  errors: Array<{ index: number; error: string }>;
}

export interface BatchProcessOptions {
  batchSize: number;
  maxConcurrency: number;
  stopOnError?: boolean;
}

export interface BatchProcessResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  durationMs: number;
  errors: Array<{ messageId: string; error: string }>;
}

/**
 * Outbox Retry Policy
 */
export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableStatuses: OutboxMessageStatus[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitter: true,
  retryableStatuses: [OutboxMessageStatus.FAILED],
};

/**
 * Outbox Message Priority
 */
export enum OutboxPriority {
  LOW = -10,
  NORMAL = 0,
  HIGH = 10,
  CRITICAL = 100,
}