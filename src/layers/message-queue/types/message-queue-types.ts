/**
 * Message Queue Layer Types
 *
 * This module defines all type definitions for the Message Queue Layer,
 * including async processing and dead letter queues.
 */

/**
 * Message
 */
export interface Message<T = unknown> {
  id: string;
  data: T;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  scheduledAt: number;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  queuedCount: number;
  processedCount: number;
  failedCount: number;
  deadLetterCount: number;
}

/**
 * Queue configuration
 */
export interface QueueConfig {
  maxRetries: number;
  retryDelay: number;
  enableDeadLetter: boolean;
  maxQueueSize: number;
}

/**
 * Queue result
 */
export interface QueueResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Message Queue Context
 */
export interface MessageQueueContext {
  input: unknown;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Message Queue Error
 */
export interface MessageQueueError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Message Queue Result
 */
export interface MessageQueueResult<T> {
  success: boolean;
  data?: T;
  error?: MessageQueueError;
}

/**
 * Message Queue Configuration
 */
export interface MessageQueueConfiguration {
  enabled: boolean;
  timeout: number;
  retries: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  strategy: string;
  options: Record<string, unknown>;
}

/**
 * Message Queue Event Types
 */
export enum MessageQueueEventType {
  MESSAGE_ENQUEUED = 'message_queue.message_enqueued',
  MESSAGE_DEQUEUED = 'message_queue.message_dequeued',
  MESSAGE_PROCESSED = 'message_queue.message_processed',
  MESSAGE_FAILED = 'message_queue.message_failed',
  MESSAGE_RETRIED = 'message_queue.message_retried',
  MESSAGE_DEAD_LETTERED = 'message_queue.message_dead_lettered',
  QUEUE_STARTED = 'message_queue.queue_started',
  QUEUE_STOPPED = 'message_queue.queue_stopped',
  QUEUE_CLEARED = 'message_queue.queue_cleared',
  CONFIG_CHANGED = 'message_queue.config_changed',
}

/**
 * Message Queue Event Payloads
 */
export interface MessageEnqueuedPayload {
  messageId: string;
  priority: number;
  queueSize: number;
  timestamp: number;
}

export interface MessageDequeuedPayload {
  messageId: string;
  attempts: number;
  maxAttempts: number;
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
  attempts: number;
  maxAttempts: number;
  willRetry: boolean;
  timestamp: number;
}

export interface MessageRetriedPayload {
  messageId: string;
  attempt: number;
  nextRetryAt: number;
  timestamp: number;
}

export interface MessageDeadLetteredPayload {
  messageId: string;
  error: string;
  attempts: number;
  timestamp: number;
}

export interface QueueStartedPayload {
  timestamp: number;
}

export interface QueueStoppedPayload {
  timestamp: number;
}

export interface QueueClearedPayload {
  previousSize: number;
  timestamp: number;
}

export interface ConfigChangedPayload {
  previousConfig: QueueConfig;
  newConfig: QueueConfig;
  timestamp: number;
}

export type MessageQueueEventPayload =
  | MessageEnqueuedPayload
  | MessageDequeuedPayload
  | MessageProcessedPayload
  | MessageFailedPayload
  | MessageRetriedPayload
  | MessageDeadLetteredPayload
  | QueueStartedPayload
  | QueueStoppedPayload
  | QueueClearedPayload
  | ConfigChangedPayload;

export interface MessageQueueDomainEvent<T extends MessageQueueEventType = MessageQueueEventType> {
  type: T;
  payload: MessageQueueEventPayload;
  timestamp: number;
  source: string;
  eventId: string;
  correlationId?: string;
}

/**
 * Message Queue Strategy Types
 */
export interface MessageQueueStrategyContext {
  operation: string;
  message?: Message;
  queueSize: number;
  config: QueueConfig;
}

export interface MessageQueueStrategyResult {
  success: boolean;
  data?: unknown;
  error?: MessageQueueError;
  metadata?: Record<string, unknown>;
}

export interface IMessageQueueStrategy {
  readonly name: string;
  readonly priority: number;
  execute(context: MessageQueueStrategyContext): Promise<MessageQueueStrategyResult>;
  canHandle(context: MessageQueueStrategyContext): boolean;
}

/**
 * Message Queue Adapter Types
 */
export interface IMessageQueueAdapter {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  enqueue<T>(data: T, priority?: number): QueueResult;
  dequeue<T>(handler: (data: T) => void | Promise<void>): Promise<void>;
  getStats(): QueueStats;
  getDeadLetterQueue<T>(): Message<T>[];
}

/**
 * Message Queue Health Types
 */
export type MessageQueueHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface MessageQueueHealthCheckResult {
  status: MessageQueueHealthStatus;
  timestamp: number;
  checks: MessageQueueHealthCheckEntry[];
  summary: string;
}

export interface MessageQueueHealthCheckEntry {
  name: string;
  status: MessageQueueHealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Message Queue Metrics Types
 */
export interface MessageQueueMetrics {
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageExecutionTime: number;
  lastExecutionTime: number;
  activeOperations: number;
}

/**
 * Message Queue Prometheus Metrics
 */
export interface MessageQueuePrometheusMetrics {
  message_queue_executions_total: number;
  message_queue_successful_executions_total: number;
  message_queue_failed_executions_total: number;
  message_queue_avg_execution_time_ms: number;
  message_queue_active_operations: number;
  collectedAt: number;
}

export interface MessageQueueMetricSample {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

/**
 * Message Queue Error Codes
 */
export enum MessageQueueErrorCode {
  QUEUE_FULL = 'QUEUE_FULL',
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  HANDLER_NOT_REGISTERED = 'HANDLER_NOT_REGISTERED',
  QUEUE_NOT_RUNNING = 'QUEUE_NOT_RUNNING',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  ADAPTER_CONNECTION_FAILED = 'ADAPTER_CONNECTION_FAILED',
  ADAPTER_OPERATION_FAILED = 'ADAPTER_OPERATION_FAILED',
  SERIALIZATION_FAILED = 'SERIALIZATION_FAILED',
  DESERIALIZATION_FAILED = 'DESERIALIZATION_FAILED',
}

export class MessageQueueError extends Error {
  readonly code: MessageQueueErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: MessageQueueErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'MessageQueueError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Message Queue Configuration Profiles
 */
export type MessageQueueProfile = 'development' | 'staging' | 'production' | 'test';

export interface MessageQueueProfileConfig {
  profile: MessageQueueProfile;
  config: MessageQueueConfiguration;
}

/**
 * Message Queue Factory Types
 */
export interface MessageQueueFactoryOptions {
  profile?: MessageQueueProfile;
  logger?: unknown;
  metricsCollector?: unknown;
  healthCheck?: unknown;
  adapter?: IMessageQueueAdapter;
}

/**
 * Message Queue Batch Types
 */
export interface BatchEnqueueOptions {
  messages: Array<{ data: unknown; priority?: number }>;
  stopOnError?: boolean;
}

export interface BatchEnqueueResult {
  success: boolean;
  results: QueueResult[];
  errors: Array<{ index: number; error: string }>;
}

/**
 * Message Queue Delay Types
 */
export interface DelayedMessageOptions {
  delayMs: number;
  maxAttempts?: number;
}

export interface ScheduledMessageOptions {
  scheduledAt: number;
  maxAttempts?: number;
}

/**
 * Message Queue Priority Levels
 */
export enum MessageQueuePriority {
  LOW = -10,
  NORMAL = 0,
  HIGH = 10,
  CRITICAL = 100,
}

/**
 * Message Queue Retry Policies
 */
export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Message Queue Dead Letter Types
 */
export interface DeadLetterEntry<T = unknown> {
  message: Message<T>;
  error: string;
  failedAt: number;
  attemptCount: number;
}

export interface DeadLetterQueueStats {
  totalEntries: number;
  oldestEntry?: number;
  newestEntry?: number;
  byErrorCode: Record<string, number>;
}
