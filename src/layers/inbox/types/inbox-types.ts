/**
 * Inbox Types
 *
 * Type definitions for the Inbox pattern for idempotent consumers layer.
 */

export interface InboxContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface InboxError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface InboxResult<T> {
  success: boolean;
  data?: T;
  error?: InboxError;
}

export interface InboxConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Inbox Message
 */
export interface InboxMessage<T = unknown> {
  id: string;
  messageId: string;
  messageType: string;
  payload: T;
  headers: Record<string, string>;
  receivedAt: number;
  processedAt?: number;
  status: InboxMessageStatus;
  retryCount: number;
  maxRetries: number;
  consumerId: string;
  metadata: Record<string, unknown>;
}

/**
 * Inbox Message Status
 */
export enum InboxMessageStatus {
  RECEIVED = 'received',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
  DUPLICATE = 'duplicate',
  ARCHIVED = 'archived',
}

/**
 * Inbox Statistics
 */
export interface InboxStats {
  receivedCount: number;
  processingCount: number;
  processedCount: number;
  failedCount: number;
  duplicateCount: number;
  archivedCount: number;
  totalCount: number;
}

/**
 * Inbox Configuration
 */
export interface InboxConfiguration {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  strategy: string;
  options: Record<string, unknown>;
  maxBatchSize: number;
  pollIntervalMs: number;
  retentionDays: number;
  enableDeduplication: boolean;
  deduplicationWindowMs: number;
  enableMetrics: boolean;
  enableHealthCheck: boolean;
}

/**
 * Inbox Event Types
 */
export enum InboxEventType {
  MESSAGE_RECEIVED = 'inbox.message_received',
  MESSAGE_PROCESSING = 'inbox.message_processing',
  MESSAGE_PROCESSED = 'inbox.message_processed',
  MESSAGE_FAILED = 'inbox.message_failed',
  MESSAGE_RETRIED = 'inbox.message_retried',
  MESSAGE_DUPLICATE = 'inbox.message_duplicate',
  MESSAGE_ARCHIVED = 'inbox.message_archived',
  BATCH_PROCESSED = 'inbox.batch_processed',
  CONFIG_CHANGED = 'inbox.config_changed',
  DEDUPLICATION_CLEANUP = 'inbox.deduplication_cleanup',
}

/**
 * Inbox Event Payloads
 */
export interface MessageReceivedPayload {
  messageId: string;
  inboxId: string;
  messageType: string;
  consumerId: string;
  timestamp: number;
}

export interface MessageProcessingPayload {
  inboxId: string;
  attempt: number;
  timestamp: number;
}

export interface MessageProcessedPayload {
  inboxId: string;
  durationMs: number;
  timestamp: number;
}

export interface MessageFailedPayload {
  inboxId: string;
  error: string;
  retryCount: number;
  maxRetries: number;
  willRetry: boolean;
  timestamp: number;
}

export interface MessageRetriedPayload {
  inboxId: string;
  attempt: number;
  nextRetryAt: number;
  timestamp: number;
}

export interface MessageDuplicatePayload {
  messageId: string;
  originalInboxId: string;
  timestamp: number;
}

export interface MessageArchivedPayload {
  inboxId: string;
  archiveLocation: string;
  timestamp: number;
}

export interface BatchProcessedPayload {
  batchSize: number;
  successCount: number;
  failureCount: number;
  duplicateCount: number;
  durationMs: number;
  timestamp: number;
}

export interface ConfigChangedPayload {
  previousConfig: InboxConfiguration;
  newConfig: InboxConfiguration;
  timestamp: number;
}

export interface DeduplicationCleanupPayload {
  entriesRemoved: number;
  timestamp: number;
}

export type InboxEventPayload =
  | MessageReceivedPayload
  | MessageProcessingPayload
  | MessageProcessedPayload
  | MessageFailedPayload
  | MessageRetriedPayload
  | MessageDuplicatePayload
  | MessageArchivedPayload
  | BatchProcessedPayload
  | ConfigChangedPayload
  | DeduplicationCleanupPayload;

export interface InboxDomainEvent<T extends InboxEventType = InboxEventType> {
  type: T;
  payload: InboxEventPayload;
  timestamp: number;
  source: string;
  eventId: string;
  correlationId?: string;
}

/**
 * Inbox Strategy Types
 */
export interface InboxStrategyContext {
  operation: string;
  message?: InboxMessage;
  batchSize: number;
  config: InboxConfiguration;
}

export interface InboxStrategyResult {
  success: boolean;
  data?: unknown;
  error?: InboxError;
  metadata?: Record<string, unknown>;
}

export interface IInboxStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: InboxStrategyContext): Promise<InboxStrategyResult>;
  canHandle(context: InboxStrategyContext): boolean;
}

/**
 * Inbox Adapter Types
 */
export interface IInboxAdapter {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  saveMessage<T>(message: InboxMessage<T>): Promise<{ success: boolean; inboxId?: string; error?: string }>;
  getMessage<T>(inboxId: string): Promise<InboxMessage<T> | null>;
  getMessageByMessageId<T>(messageId: string): Promise<InboxMessage<T> | null>;
  getMessages(options?: { status?: InboxMessageStatus; limit?: number; offset?: number }): Promise<InboxMessage[]>;
  updateMessage(inboxId: string, updates: Partial<InboxMessage>): Promise<{ success: boolean; error?: string }>;
  markProcessed(inboxId: string): Promise<{ success: boolean; error?: string }>;
  markFailed(inboxId: string, error: string): Promise<{ success: boolean; error?: string }>;
  markDuplicate(inboxId: string, originalInboxId: string): Promise<{ success: boolean; error?: string }>;
  archiveMessage(inboxId: string): Promise<{ success: boolean; error?: string }>;
  getStats(): Promise<InboxStats>;
  clear(): Promise<void>;
  cleanupDeduplication(): Promise<number>;
}

/**
 * Inbox Health Types
 */
export type InboxHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface InboxHealthCheckResult {
  status: InboxHealthStatus;
  timestamp: number;
  checks: InboxHealthCheckEntry[];
  summary: string;
}

export interface InboxHealthCheckEntry {
  name: string;
  status: InboxHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Inbox Metrics Types
 */
export interface InboxMetrics {
  totalMessages: number;
  processedCount: number;
  failedCount: number;
  duplicateCount: number;
  averageProcessingTime: number;
  deduplicationHits: number;
}

/**
 * Inbox Prometheus Metrics
 */
export interface InboxPrometheusMetrics {
  inbox_messages_total: number;
  inbox_processed_total: number;
  inbox_failed_total: number;
  inbox_duplicates_total: number;
  inbox_avg_processing_time_ms: number;
  inbox_deduplication_hits_total: number;
  collectedAt: number;
}

export interface InboxMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Inbox Error Codes
 */
export enum InboxErrorCode {
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  DUPLICATE_MESSAGE = 'DUPLICATE_MESSAGE',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  MESSAGE_ALREADY_PROCESSED = 'MESSAGE_ALREADY_PROCESSED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  ADAPTER_CONNECTION_FAILED = 'ADAPTER_CONNECTION_FAILED',
  ADAPTER_OPERATION_FAILED = 'ADAPTER_OPERATION_FAILED',
  SERIALIZATION_FAILED = 'SERIALIZATION_FAILED',
  DESERIALIZATION_FAILED = 'DESERIALIZATION_FAILED',
  BATCH_PROCESSING_FAILED = 'BATCH_PROCESSING_FAILED',
  DEDUPLICATION_FAILED = 'DEDUPLICATION_FAILED',
}

/**
 * Inbox Error Class
 */
export class InboxError extends Error {
  readonly code: InboxErrorCode;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;

  constructor(code: InboxErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'InboxError';
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
 * Inbox Configuration Profiles
 */
export type InboxProfile = 'development' | 'staging' | 'production' | 'test';

export interface InboxProfileConfig {
  profile: InboxProfile;
  config: InboxConfiguration;
}

/**
 * Inbox Factory Types
 */
export interface InboxFactoryOptions {
  profile?: InboxProfile;
  logger?: unknown;
  metricsCollector?: unknown;
  healthCheck?: unknown;
  adapter?: IInboxAdapter;
}

/**
 * Inbox Batch Operations
 */
export interface BatchReceiveOptions {
  messages: Array<Omit<InboxMessage, 'id' | 'receivedAt' | 'retryCount' | 'status' | 'consumerId'>>;
  consumerId: string;
  stopOnError?: boolean;
}

export interface BatchReceiveResult {
  success: boolean;
  results: Array<{ success: boolean; inboxId?: string; error?: string; duplicate?: boolean }>;
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
  duplicateCount: number;
  durationMs: number;
  errors: Array<{ inboxId: string; error: string }>;
}

/**
 * Inbox Retry Policy
 */
export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableStatuses: InboxMessageStatus[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableStatuses: [InboxMessageStatus.FAILED],
};

/**
 * Inbox Deduplication Types
 */
export interface DeduplicationEntry {
  messageId: string;
  inboxId: string;
  receivedAt: number;
  expiresAt: number;
}

export interface DeduplicationStats {
  totalEntries: number;
  activeEntries: number;
  expiredEntries: number;
  hitRate: number;
}