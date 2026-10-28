/**
 * DeadLetter Types
 *
 * Type definitions for the Dead letter queue management layer.
 */

export interface DeadLetterContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface DeadLetterError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DeadLetterResult<T> {
  success: boolean;
  data?: T;
  error?: DeadLetterError;
}

export interface DeadLetterConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Dead Letter Entry
 */
export interface DeadLetterEntry<T = unknown> {
  id: string;
  originalMessage: T;
  originalQueue: string;
  error: string;
  errorCode: string;
  failedAt: number;
  retryCount: number;
  maxRetries: number;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

/**
 * Dead Letter Queue Statistics
 */
export interface DeadLetterQueueStats {
  totalEntries: number;
  oldestEntry?: number;
  newestEntry?: number;
  byErrorCode: Record<string, number>;
  byOriginalQueue: Record<string, number>;
  totalRetries: number;
}

/**
 * Dead Letter Configuration
 */
export interface DeadLetterConfiguration {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  strategy: string;
  options: Record<string, unknown>;
  maxQueueSize: number;
  retentionDays: number;
  enableRetry: boolean;
  enableReplay: boolean;
  enableMetrics: boolean;
}

/**
 * Dead Letter Event Types
 */
export enum DeadLetterEventType {
  MESSAGE_ADDED = 'dead_letter.message_added',
  MESSAGE_RETRIED = 'dead_letter.message_retried',
  MESSAGE_REPLAYED = 'dead_letter.message_replayed',
  MESSAGE_DISCARDED = 'dead_letter.message_discarded',
  MESSAGE_ARCHIVED = 'dead_letter.message_archived',
  QUEUE_CLEARED = 'dead_letter.queue_cleared',
  CONFIG_CHANGED = 'dead_letter.config_changed',
  RETRY_POLICY_CHANGED = 'dead_letter.retry_policy_changed',
}

/**
 * Dead Letter Event Payloads
 */
export interface MessageAddedPayload {
  entryId: string;
  originalQueue: string;
  errorCode: string;
  retryCount: number;
  timestamp: number;
}

export interface MessageRetriedPayload {
  entryId: string;
  attempt: number;
  maxAttempts: number;
  timestamp: number;
}

export interface MessageReplayedPayload {
  entryId: string;
  targetQueue: string;
  timestamp: number;
}

export interface MessageDiscardedPayload {
  entryId: string;
  reason: string;
  timestamp: number;
}

export interface MessageArchivedPayload {
  entryId: string;
  archiveLocation: string;
  timestamp: number;
}

export interface QueueClearedPayload {
  entriesRemoved: number;
  timestamp: number;
}

export interface ConfigChangedPayload {
  previousConfig: DeadLetterConfiguration;
  newConfig: DeadLetterConfiguration;
  timestamp: number;
}

export interface RetryPolicyChangedPayload {
  previousPolicy: RetryPolicy;
  newPolicy: RetryPolicy;
  timestamp: number;
}

export type DeadLetterEventPayload =
  | MessageAddedPayload
  | MessageRetriedPayload
  | MessageReplayedPayload
  | MessageDiscardedPayload
  | MessageArchivedPayload
  | QueueClearedPayload
  | ConfigChangedPayload
  | RetryPolicyChangedPayload;

export interface DeadLetterDomainEvent<T extends DeadLetterEventType = DeadLetterEventType> {
  type: T;
  payload: DeadLetterEventPayload;
  timestamp: number;
  source: string;
  eventId: string;
  correlationId?: string;
}

/**
 * Dead Letter Strategy Types
 */
export interface DeadLetterStrategyContext {
  operation: string;
  entry?: DeadLetterEntry;
  queueSize: number;
  config: DeadLetterConfiguration;
}

export interface DeadLetterStrategyResult {
  success: boolean;
  data?: unknown;
  error?: DeadLetterError;
  metadata?: Record<string, unknown>;
}

export interface IDeadLetterStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: DeadLetterStrategyContext): Promise<DeadLetterStrategyResult>;
  canHandle(context: DeadLetterStrategyContext): boolean;
}

/**
 * Dead Letter Adapter Types
 */
export interface IDeadLetterAdapter {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  addEntry<T>(entry: DeadLetterEntry<T>): Promise<{ success: boolean; entryId?: string; error?: string }>;
  getEntry<T>(entryId: string): Promise<DeadLetterEntry<T> | null>;
  getEntries(options?: { limit?: number; offset?: number; queue?: string; errorCode?: string }): Promise<DeadLetterEntry[]>;
  retryEntry(entryId: string): Promise<{ success: boolean; error?: string }>;
  replayEntry(entryId: string, targetQueue: string): Promise<{ success: boolean; error?: string }>;
  discardEntry(entryId: string, reason: string): Promise<{ success: boolean; error?: string }>;
  archiveEntry(entryId: string, archiveLocation: string): Promise<{ success: boolean; error?: string }>;
  getStats(): Promise<DeadLetterQueueStats>;
  clear(): Promise<void>;
}

/**
 * Dead Letter Health Types
 */
export type DeadLetterHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DeadLetterHealthCheckResult {
  status: DeadLetterHealthStatus;
  timestamp: number;
  checks: DeadLetterHealthCheckEntry[];
  summary: string;
}

export interface DeadLetterHealthCheckEntry {
  name: string;
  status: DeadLetterHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Dead Letter Metrics Types
 */
export interface DeadLetterMetrics {
  totalEntries: number;
  retriedCount: number;
  replayedCount: number;
  discardedCount: number;
  archivedCount: number;
  averageRetryTime: number;
  averageReplayTime: number;
  queueSize: number;
}

/**
 * Dead Letter Prometheus Metrics
 */
export interface DeadLetterPrometheusMetrics {
  dead_letter_entries_total: number;
  dead_letter_retried_total: number;
  dead_letter_replayed_total: number;
  dead_letter_discarded_total: number;
  dead_letter_archived_total: number;
  dead_letter_queue_size: number;
  dead_letter_avg_retry_time_ms: number;
  dead_letter_avg_replay_time_ms: number;
  collectedAt: number;
}

export interface DeadLetterMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Dead Letter Error Codes
 */
export enum DeadLetterErrorCode {
  QUEUE_FULL = 'QUEUE_FULL',
  ENTRY_NOT_FOUND = 'ENTRY_NOT_FOUND',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  REPLAY_FAILED = 'REPLAY_FAILED',
  ARCHIVE_FAILED = 'ARCHIVE_FAILED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  ADAPTER_CONNECTION_FAILED = 'ADAPTER_CONNECTION_FAILED',
  ADAPTER_OPERATION_FAILED = 'ADAPTER_OPERATION_FAILED',
  SERIALIZATION_FAILED = 'SERIALIZATION_FAILED',
  DESERIALIZATION_FAILED = 'DESERIALIZATION_FAILED',
  RETRY_NOT_ALLOWED = 'RETRY_NOT_ALLOWED',
  REPLAY_NOT_ALLOWED = 'REPLAY_NOT_ALLOWED',
}

/**
 * Dead Letter Error Class
 */
export class DeadLetterErrorClass extends Error {
  readonly code: DeadLetterErrorCode;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;

  constructor(code: DeadLetterErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DeadLetterError';
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
 * Dead Letter Configuration Profiles
 */
export type DeadLetterProfile = 'development' | 'staging' | 'production' | 'test';

export interface DeadLetterProfileConfig {
  profile: DeadLetterProfile;
  config: DeadLetterConfiguration;
}

/**
 * Dead Letter Factory Types
 */
export interface DeadLetterFactoryOptions {
  profile?: DeadLetterProfile;
  logger?: unknown;
  metricsCollector?: unknown;
  healthCheck?: unknown;
  adapter?: IDeadLetterAdapter;
}

/**
 * Dead Letter Retry Policy
 */
export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrorCodes: string[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 5000,
  maxDelayMs: 300000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrorCodes: ['TIMEOUT', 'CONNECTION_ERROR', 'RATE_LIMITED', 'TEMPORARY_FAILURE'],
};

/**
 * Dead Letter Replay Options
 */
export interface ReplayOptions {
  targetQueue: string;
  modifyMessage?: (message: unknown) => unknown;
  resetRetryCount?: boolean;
}

/**
 * Dead Letter Archive Options
 */
export interface ArchiveOptions {
  archiveLocation: string;
  compress?: boolean;
  encrypt?: boolean;
}

/**
 * Dead Letter Batch Operations
 */
export interface BatchRetryOptions {
  entryIds: string[];
  stopOnError?: boolean;
}

export interface BatchRetryResult {
  success: boolean;
  results: Array<{ entryId: string; success: boolean; error?: string }>;
  errors: Array<{ entryId: string; error: string }>;
}

export interface BatchReplayOptions {
  entries: Array<{ entryId: string; targetQueue: string }>;
  stopOnError?: boolean;
}

export interface BatchReplayResult {
  success: boolean;
  results: Array<{ entryId: string; success: boolean; error?: string }>;
  errors: Array<{ entryId: string; error: string }>;
}

export interface BatchDiscardOptions {
  entryIds: string[];
  reason: string;
}

export interface BatchDiscardResult {
  success: boolean;
  results: Array<{ entryId: string; success: boolean; error?: string }>;
  errors: Array<{ entryId: string; error: string }>;
}