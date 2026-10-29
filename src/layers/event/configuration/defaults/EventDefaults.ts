/**
 * Event Default Configuration Values
 *
 * Centralized default values and limits for event layer configuration.
 *
 * @module EventLayer/Configuration
 */

import { EventBusConfigOptions } from '../EventBusConfig';

/**
 * Default event bus configuration options.
 */
export const DEFAULT_EVENT_BUS_CONFIG: EventBusConfigOptions = {
  enableAsync: true,
  enablePersistence: false,
  maxQueueSize: 1000,
  maxSubscriptions: 10000,
  timeout: 5000,
  retryOnFailure: false,
  maxRetries: 3,
  enableMetrics: true,
  enableLogging: true,
  logLevel: 'info',
  serializationFormat: 'json',
};

/**
 * Configuration limits for validation.
 */
export const EVENT_CONFIG_LIMITS = {
  /** Minimum timeout in milliseconds */
  minTimeout: 1,
  /** Maximum timeout in milliseconds */
  maxTimeout: 300000,
  /** Minimum max retries */
  minRetries: 0,
  /** Maximum max retries */
  maxRetries: 100,
  /** Minimum queue size */
  minQueueSize: 1,
  /** Maximum queue size */
  maxQueueSize: 1000000,
  /** Minimum subscriptions */
  minSubscriptions: 1,
  /** Maximum subscriptions */
  maxSubscriptions: 1000000,
  /** Minimum metrics interval */
  minMetricsIntervalMs: 1000,
  /** Maximum metrics interval */
  maxMetricsIntervalMs: 3600000,
  /** Minimum health check interval */
  minHealthCheckIntervalMs: 1000,
  /** Maximum health check interval */
  maxHealthCheckIntervalMs: 300000,
} as const;

/**
 * Default adapter configurations.
 */
export const DEFAULT_ADAPTER_CONFIGS = {
  memory: {
    enableAsync: true,
    enablePersistence: false,
    maxEventHistory: 1000,
    maxSubscriptions: 10000,
    defaultTimeoutMs: 5000,
  },
  redis: {
    host: 'localhost',
    port: 6379,
    keyPrefix: 'events:',
    connectionTimeout: 5000,
    commandTimeout: 3000,
    enableOfflineQueue: true,
    stream: {
      maxLength: 10000,
      consumerGroup: 'event-bus',
      consumerName: `consumer-${process.pid}`,
      blockMs: 5000,
      count: 100,
    },
    pubsub: {
      enabled: true,
      channels: [],
    },
  },
  http: {
    endpoints: [],
    defaultBatch: {
      maxSize: 50,
      maxWaitMs: 5000,
    },
    defaultRetry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      exponentialBackoff: true,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    },
    defaultTimeoutMs: 10000,
    userAgent: 'OneMillionHelloWorld/1.0 (Event HTTP Adapter)',
    enableBuffering: true,
    maxBufferSize: 10000,
  },
  kafka: {
    producer: {
      brokers: ['localhost:9092'],
      clientId: 'event-bus',
      acks: 'all' as const,
      retries: 3,
      retryDelayMs: 100,
      enableIdempotence: true,
      transactionTimeoutMs: 10000,
      compression: 'snappy' as const,
      batchSize: 16384,
      lingerMs: 5,
      bufferMemory: 33554432,
      maxRequestSize: 1048576,
    },
    consumer: {
      brokers: ['localhost:9092'],
      groupId: 'event-bus',
      topics: ['events'],
      autoOffsetReset: 'latest' as const,
      enableAutoCommit: true,
      autoCommitIntervalMs: 5000,
      maxPollRecords: 500,
      maxPollIntervalMs: 300000,
      sessionTimeoutMs: 30000,
      heartbeatIntervalMs: 3000,
    },
    topicPrefix: 'events.',
    defaultTopic: 'events.default',
    serializer: 'json' as const,
  },
} as const;

/**
 * Default strategy configurations.
 */
export const DEFAULT_STRATEGY_CONFIGS = {
  default: {},
  fast: {},
  reliable: {
    maxRetries: 3,
    baseRetryDelayMs: 100,
    maxRetryDelayMs: 5000,
    exponentialBackoff: true,
    attemptTimeoutMs: 5000,
  },
  cached: {
    maxCacheSize: 1000,
    ttlMs: 60000,
    cacheErrors: false,
    keyPrefix: 'event:',
  },
  batch: {
    maxBatchSize: 100,
    maxBatchWaitMs: 5000,
    asyncProcessing: true,
    maxConcurrentBatches: 10,
  },
  broadcast: {
    mode: 'parallel' as const,
    maxConcurrency: 10,
    deliveryTimeoutMs: 5000,
    continueOnError: true,
    collectAllResults: true,
  },
  filtered: {
    defaultAction: 'allow' as const,
    stopOnFirstMatch: false,
    allowAsyncPredicates: true,
  },
  prioritized: {
    maxQueueSize: 10000,
    enablePreemption: true,
    maxWaitTimeMs: 30000,
    weightedFairQueuing: true,
    priorityWeights: {
      LOW: 1,
      NORMAL: 2,
      HIGH: 4,
      CRITICAL: 8,
    },
    workerCount: 4,
  },
  'dead-letter': {
    retryPolicy: {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      exponentialBackoff: true,
      jitterFactor: 0.1,
      retryableErrorCodes: ['TIMEOUT', 'NETWORK_ERROR', 'TEMPORARY_FAILURE', 'RATE_LIMITED'],
      nonRetryableErrorCodes: ['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'],
    },
    maxQueueSize: 10000,
    autoRetry: true,
    autoRetryIntervalMs: 30000,
    persistEntries: false,
    maxEntryAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
} as const;

/**
 * Default metrics configuration.
 */
export const DEFAULT_METRICS_CONFIG = {
  enabled: true,
  maxSamplesPerMetric: 10000,
  sampleRetentionMs: 3600000,
  enablePercentiles: true,
  percentiles: [0.5, 0.9, 0.95, 0.99],
  collectionIntervalMs: 10000,
} as const;

/**
 * Default health check configuration.
 */
export const DEFAULT_HEALTH_CHECK_CONFIG = {
  enabled: true,
  checkConnectivity: true,
  checkQueueDepth: true,
  checkProcessingLag: true,
  maxQueueDepth: 10000,
  maxProcessingLagMs: 5000,
  checkTimeoutMs: 5000,
  intervalMs: 30000,
} as const;

/**
 * Default logging configuration.
 */
export const DEFAULT_LOGGING_CONFIG = {
  enabled: true,
  level: 'info' as const,
  format: 'json' as const,
  includeTimestamp: true,
  includeLevel: true,
  includeContext: true,
} as const;

/**
 * Profile-specific default configurations.
 */
export const PROFILE_DEFAULTS: Record<string, Partial<EventBusConfigOptions>> = {
  development: {
    enableAsync: true,
    enablePersistence: false,
    maxQueueSize: 1000,
    maxSubscriptions: 1000,
    timeout: 5000,
    retryOnFailure: true,
    maxRetries: 1,
    enableMetrics: true,
    enableLogging: true,
    logLevel: 'debug',
    serializationFormat: 'json',
  },
  testing: {
    enableAsync: false,
    enablePersistence: false,
    maxQueueSize: 100,
    maxSubscriptions: 100,
    timeout: 1000,
    retryOnFailure: false,
    maxRetries: 0,
    enableMetrics: false,
    enableLogging: false,
    logLevel: 'error',
    serializationFormat: 'json',
  },
  staging: {
    enableAsync: true,
    enablePersistence: true,
    maxQueueSize: 5000,
    maxSubscriptions: 5000,
    timeout: 10000,
    retryOnFailure: true,
    maxRetries: 3,
    enableMetrics: true,
    enableLogging: true,
    logLevel: 'info',
    serializationFormat: 'json',
  },
  production: {
    enableAsync: true,
    enablePersistence: true,
    maxQueueSize: 10000,
    maxSubscriptions: 50000,
    timeout: 30000,
    retryOnFailure: true,
    maxRetries: 5,
    enableMetrics: true,
    enableLogging: true,
    logLevel: 'warn',
    serializationFormat: 'json',
  },
  'high-throughput': {
    enableAsync: true,
    enablePersistence: true,
    maxQueueSize: 100000,
    maxSubscriptions: 100000,
    timeout: 10000,
    retryOnFailure: true,
    maxRetries: 2,
    enableMetrics: true,
    enableLogging: false,
    logLevel: 'warn',
    serializationFormat: 'json',
  },
  'low-latency': {
    enableAsync: true,
    enablePersistence: false,
    maxQueueSize: 1000,
    maxSubscriptions: 10000,
    timeout: 1000,
    retryOnFailure: false,
    maxRetries: 0,
    enableMetrics: false,
    enableLogging: false,
    logLevel: 'error',
    serializationFormat: 'json',
  },
  reliable: {
    enableAsync: true,
    enablePersistence: true,
    maxQueueSize: 50000,
    maxSubscriptions: 50000,
    timeout: 60000,
    retryOnFailure: true,
    maxRetries: 10,
    enableMetrics: true,
    enableLogging: true,
    logLevel: 'info',
    serializationFormat: 'json',
  },
} as const;

/**
 * Valid log levels.
 */
export const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

/**
 * Valid serialization formats.
 */
export const VALID_SERIALIZATION_FORMATS = ['json', 'protobuf', 'msgpack'];

/**
 * Valid adapter types.
 */
export const VALID_ADAPTER_TYPES = ['memory', 'redis', 'http', 'kafka'];

/**
 * Valid strategy names.
 */
export const VALID_STRATEGY_NAMES = [
  'default',
  'fast',
  'reliable',
  'cached',
  'batch',
  'broadcast',
  'filtered',
  'prioritized',
  'dead-letter',
];

/**
 * Valid profile names.
 */
export const VALID_PROFILES = [
  'development',
  'testing',
  'staging',
  'production',
  'high-throughput',
  'low-latency',
  'reliable',
];