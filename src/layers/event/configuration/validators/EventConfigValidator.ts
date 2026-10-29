/**
 * Event Configuration Validator
 *
 * Zod-based validation for event layer configuration.
 * Provides comprehensive validation with detailed error messages.
 *
 * @module EventLayer/Configuration
 */

import { z } from 'zod';
import {
  EVENT_CONFIG_LIMITS,
  VALID_LOG_LEVELS,
  VALID_SERIALIZATION_FORMATS,
  VALID_ADAPTER_TYPES,
  VALID_STRATEGY_NAMES,
  VALID_PROFILES,
  DEFAULT_EVENT_BUS_CONFIG,
} from '../defaults/EventDefaults';
import { EventBusConfigOptions } from '../EventBusConfig';

/**
 * Validation result.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors */
  errors: ValidationError[];
  /** Validation warnings */
  warnings: ValidationWarning[];
}

/**
 * Validation error.
 */
export interface ValidationError {
  /** Field path */
  path: string;
  /** Error message */
  message: string;
  /** Invalid value */
  value?: unknown;
  /** Expected type/format */
  expected?: string;
}

/**
 * Validation warning.
 */
export interface ValidationWarning {
  /** Field path */
  path: string;
  /** Warning message */
  message: string;
  /** Current value */
  value?: unknown;
  /** Suggested value */
  suggestion?: unknown;
}

/**
 * Zod schema for event bus configuration.
 */
const EventBusConfigSchema = z.object({
  enableAsync: z.boolean().default(true),
  enablePersistence: z.boolean().default(false),
  maxQueueSize: z
    .number()
    .int()
    .positive()
    .max(EVENT_CONFIG_LIMITS.maxQueueSize)
    .default(DEFAULT_EVENT_BUS_CONFIG.maxQueueSize ?? 1000),
  maxSubscriptions: z
    .number()
    .int()
    .positive()
    .max(EVENT_CONFIG_LIMITS.maxSubscriptions)
    .default(DEFAULT_EVENT_BUS_CONFIG.maxSubscriptions ?? 10000),
  timeout: z
    .number()
    .int()
    .positive()
    .max(EVENT_CONFIG_LIMITS.maxTimeout)
    .default(DEFAULT_EVENT_BUS_CONFIG.timeout ?? 5000),
  retryOnFailure: z.boolean().default(false),
  maxRetries: z
    .number()
    .int()
    .min(EVENT_CONFIG_LIMITS.minRetries)
    .max(EVENT_CONFIG_LIMITS.maxRetries)
    .default(DEFAULT_EVENT_BUS_CONFIG.maxRetries ?? 3),
  enableMetrics: z.boolean().default(true),
  enableLogging: z.boolean().default(true),
  logLevel: z.union([z.literal('debug'), z.literal('info'), z.literal('warn'), z.literal('error')]).default((DEFAULT_EVENT_BUS_CONFIG.logLevel ?? 'info') as 'debug' | 'info' | 'warn' | 'error'),
  serializationFormat: z.union([z.literal('json'), z.literal('protobuf'), z.literal('msgpack')]).default((DEFAULT_EVENT_BUS_CONFIG.serializationFormat ?? 'json') as 'json' | 'protobuf' | 'msgpack'),
});

/**
 * Zod schema for memory adapter configuration.
 */
const MemoryAdapterConfigSchema = z.object({
  enableAsync: z.boolean().default(true),
  enablePersistence: z.boolean().default(false),
  maxEventHistory: z.number().int().min(0).max(100000).default(1000),
  maxSubscriptions: z.number().int().positive().max(100000).default(10000),
  defaultTimeoutMs: z.number().int().positive().max(60000).default(5000),
});

/**
 * Zod schema for Redis adapter configuration.
 */
const RedisAdapterConfigSchema = z.object({
  host: z.string().min(1).default('localhost'),
  port: z.number().int().positive().max(65535).default(6379),
  password: z.string().optional(),
  db: z.number().int().min(0).max(15).default(0),
  keyPrefix: z.string().default('events:'),
  connectionTimeout: z.number().int().positive().max(60000).default(5000),
  commandTimeout: z.number().int().positive().max(30000).default(3000),
  enableOfflineQueue: z.boolean().default(true),
  retryStrategy: z.function().args(z.number()).returns(z.number().nullable()).optional(),
  tls: z.union([z.boolean(), z.record(z.unknown())]).optional(),
  stream: z
    .object({
      maxLength: z.number().int().positive().max(1000000).default(10000),
      consumerGroup: z.string().default('event-bus'),
      consumerName: z.string().default(`consumer-${process.pid}`),
      blockMs: z.number().int().positive().max(60000).default(5000),
      count: z.number().int().positive().max(10000).default(100),
    })
    .optional(),
  pubsub: z
    .object({
      enabled: z.boolean().default(true),
      channels: z.array(z.string()).default([]),
    })
    .optional(),
});

/**
 * Zod schema for HTTP adapter configuration.
 */
const HttpAdapterConfigSchema = z.object({
  endpoints: z
    .array(
      z.object({
        name: z.string().min(1),
        url: z.string().url(),
        method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
        headers: z.record(z.string()).default({}),
        auth: z
          .object({
            type: z.enum(['bearer', 'basic', 'api-key', 'custom']),
            credentials: z.record(z.string()),
          })
          .optional(),
        batch: z
          .object({
            maxSize: z.number().int().positive().max(10000).default(50),
            maxWaitMs: z.number().int().positive().max(60000).default(5000),
          })
          .optional(),
        retry: z
          .object({
            maxAttempts: z.number().int().positive().max(100).default(3),
            baseDelayMs: z.number().int().positive().max(60000).default(1000),
            maxDelayMs: z.number().int().positive().max(300000).default(30000),
            exponentialBackoff: z.boolean().default(true),
            retryableStatusCodes: z.array(z.number().int()).default([408, 429, 500, 502, 503, 504]),
          })
          .optional(),
        timeoutMs: z.number().int().positive().max(300000).optional(),
        filter: z.function().args(z.string(), z.unknown()).returns(z.boolean()).optional(),
        transform: z.function().args(z.string(), z.unknown()).returns(z.unknown()).optional(),
      })
    )
    .default([]),
  defaultBatch: z
    .object({
      maxSize: z.number().int().positive().max(10000).default(50),
      maxWaitMs: z.number().int().positive().max(60000).default(5000),
    })
    .default({ maxSize: 50, maxWaitMs: 5000 }),
  defaultRetry: z
    .object({
      maxAttempts: z.number().int().positive().max(100).default(3),
      baseDelayMs: z.number().int().positive().max(60000).default(1000),
      maxDelayMs: z.number().int().positive().max(300000).default(30000),
      exponentialBackoff: z.boolean().default(true),
      retryableStatusCodes: z.array(z.number().int()).default([408, 429, 500, 502, 503, 504]),
    })
    .default({
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      exponentialBackoff: true,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    }),
  defaultTimeoutMs: z.number().int().positive().max(300000).default(10000),
  userAgent: z.string().default('OneMillionHelloWorld/1.0 (Event HTTP Adapter)'),
  enableBuffering: z.boolean().default(true),
  maxBufferSize: z.number().int().positive().max(1000000).default(10000),
});

/**
 * Zod schema for Kafka adapter configuration.
 */
const KafkaAdapterConfigSchema = z.object({
  producer: z.object({
    brokers: z.array(z.string().min(1)).min(1),
    clientId: z.string().default('event-bus'),
    acks: z.enum(['all', '1', '0']).default('all'),
    retries: z.number().int().min(0).max(100).default(3),
    retryDelayMs: z.number().int().positive().max(60000).default(100),
    enableIdempotence: z.boolean().default(true),
    transactionTimeoutMs: z.number().int().positive().max(300000).default(10000),
    compression: z.enum(['gzip', 'snappy', 'lz4', 'zstd']).default('snappy'),
    batchSize: z.number().int().positive().max(1000000).default(16384),
    lingerMs: z.number().int().min(0).max(1000).default(5),
    bufferMemory: z.number().int().positive().max(1000000000).default(33554432),
    maxRequestSize: z.number().int().positive().max(100000000).default(1048576),
    sasl: z
      .object({
        mechanism: z.enum(['plain', 'scram-sha-256', 'scram-sha-512', 'oauthbearer']),
        username: z.string(),
        password: z.string(),
      })
      .optional(),
    ssl: z.union([z.boolean(), z.record(z.unknown())]).optional(),
  }),
  consumer: z.object({
    brokers: z.array(z.string().min(1)).min(1),
    groupId: z.string().min(1),
    clientId: z.string().optional(),
    topics: z.array(z.string().min(1)).min(1),
    autoOffsetReset: z.enum(['earliest', 'latest', 'none']).default('latest'),
    enableAutoCommit: z.boolean().default(true),
    autoCommitIntervalMs: z.number().int().positive().max(60000).default(5000),
    maxPollRecords: z.number().int().positive().max(10000).default(500),
    maxPollIntervalMs: z.number().int().positive().max(600000).default(300000),
    sessionTimeoutMs: z.number().int().positive().max(300000).default(30000),
    heartbeatIntervalMs: z.number().int().positive().max(60000).default(3000),
    sasl: z
      .object({
        mechanism: z.enum(['plain', 'scram-sha-256', 'scram-sha-512', 'oauthbearer']),
        username: z.string(),
        password: z.string(),
      })
      .optional(),
    ssl: z.union([z.boolean(), z.record(z.unknown())]).optional(),
  }),
  topicPrefix: z.string().default('events.'),
  defaultTopic: z.string().default('events.default'),
  serializer: z.enum(['json', 'avro', 'protobuf']).default('json'),
  schemaRegistryUrl: z.string().url().optional(),
});

/**
 * Zod schema for strategy configuration.
 */
const StrategyConfigSchema = z.object({
  name: z.union([z.literal('default'), z.literal('fast'), z.literal('reliable'), z.literal('cached'), z.literal('batch'), z.literal('broadcast'), z.literal('filtered'), z.literal('prioritized'), z.literal('dead-letter')]),
  config: z.record(z.unknown()).default({}),
});

/**
 * Zod schema for metrics configuration.
 */
const MetricsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxSamplesPerMetric: z.number().int().positive().max(100000).default(10000),
  sampleRetentionMs: z.number().int().positive().max(86400000).default(3600000),
  enablePercentiles: z.boolean().default(true),
  percentiles: z.array(z.number().min(0).max(1)).default([0.5, 0.9, 0.95, 0.99]),
  collectionIntervalMs: z.number().int().positive().default(10000),
});

/**
 * Zod schema for health check configuration.
 */
const HealthCheckConfigSchema = z.object({
  enabled: z.boolean().default(true),
  checkConnectivity: z.boolean().default(true),
  checkQueueDepth: z.boolean().default(true),
  checkProcessingLag: z.boolean().default(true),
  maxQueueDepth: z.number().int().positive().max(1000000).default(10000),
  maxProcessingLagMs: z.number().int().positive().max(300000).default(5000),
  checkTimeoutMs: z.number().int().positive().max(60000).default(5000),
  intervalMs: z.number().int().positive().max(300000).default(30000),
});

/**
 * Zod schema for logging configuration.
 */
const LoggingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  level: z.union([z.literal('debug'), z.literal('info'), z.literal('warn'), z.literal('error')]).default('info'),
  format: z.enum(['json', 'text']).default('json'),
  includeTimestamp: z.boolean().default(true),
  includeLevel: z.boolean().default(true),
  includeContext: z.boolean().default(true),
});

/**
 * Zod schema for complete event configuration.
 */
const EventConfigurationSchema = z.object({
  eventBus: EventBusConfigSchema,
  adapter: z.discriminatedUnion('type', [
    z.object({ type: z.literal('memory'), config: MemoryAdapterConfigSchema }),
    z.object({ type: z.literal('redis'), config: RedisAdapterConfigSchema }),
    z.object({ type: z.literal('http'), config: HttpAdapterConfigSchema }),
    z.object({ type: z.literal('kafka'), config: KafkaAdapterConfigSchema }),
  ]),
  strategy: StrategyConfigSchema,
  metrics: MetricsConfigSchema,
  healthCheck: HealthCheckConfigSchema,
  logging: LoggingConfigSchema,
});

/**
 * Event Configuration Validator.
 * Uses Zod for schema validation with detailed error reporting.
 */
export class EventConfigValidator {
  private _schema: z.ZodSchema;

  /**
   * Creates a new EventConfigValidator.
   */
  constructor() {
    this._schema = EventConfigurationSchema;
  }

  /**
   * Validates a configuration object.
   *
   * @param config - Configuration to validate
   * @returns Validation result
   */
  validate(config: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const result = this._schema.safeParse(config);

    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        errors.push({
          path,
          message: issue.message,
          value: this._getValueAtPath(config, issue.path),
          expected: this._getExpectedType(issue),
        });
      }
    } else {
      // Additional semantic validation
      this._validateSemantics(result.data, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates and throws on failure.
   *
   * @param config - Configuration to validate
   * @throws Error if validation fails
   */
  validateOrThrow(config: unknown): void {
    const result = this.validate(config);
    if (!result.valid) {
      const messages = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new Error(`Invalid event configuration: ${messages}`);
    }
  }

  /**
   * Validates event bus configuration only.
   */
  validateEventBusConfig(config: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const result = EventBusConfigSchema.safeParse(config);

    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        errors.push({
          path,
          message: issue.message,
          value: this._getValueAtPath(config, issue.path),
          expected: this._getExpectedType(issue),
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates adapter configuration.
   */
  validateAdapterConfig(type: string, config: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    let schema: z.ZodSchema;
    switch (type) {
      case 'memory':
        schema = MemoryAdapterConfigSchema;
        break;
      case 'redis':
        schema = RedisAdapterConfigSchema;
        break;
      case 'http':
        schema = HttpAdapterConfigSchema;
        break;
      case 'kafka':
        schema = KafkaAdapterConfigSchema;
        break;
      default:
        return {
          valid: false,
          errors: [{ path: 'type', message: `Unknown adapter type: ${type}`, value: type }],
          warnings: [],
        };
    }

    const result = schema.safeParse(config);

    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        errors.push({
          path,
          message: issue.message,
          value: this._getValueAtPath(config, issue.path),
          expected: this._getExpectedType(issue),
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validates strategy configuration.
   */
  validateStrategyConfig(config: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const result = StrategyConfigSchema.safeParse(config);

    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        errors.push({
          path,
          message: issue.message,
          value: this._getValueAtPath(config, issue.path),
          expected: this._getExpectedType(issue),
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Gets default configuration.
   */
  getDefaults(): EventBusConfigOptions {
    return { ...DEFAULT_EVENT_BUS_CONFIG };
  }

  /**
   * Performs semantic validation on parsed configuration.
   */
  private _validateSemantics(
    config: z.infer<typeof EventConfigurationSchema> & { metrics?: Record<string, unknown>; healthCheck?: Record<string, unknown> },
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    // Check if persistence is enabled but adapter doesn't support it
    if (config.eventBus.enablePersistence && config.adapter.type === 'memory') {
      warnings.push({
        path: 'adapter.type',
        message: 'In-memory adapter does not support persistence',
        value: 'memory',
        suggestion: 'redis or kafka',
      });
    }

    // Check if high queue size with low timeout
    if (config.eventBus.maxQueueSize > 10000 && config.eventBus.timeout < 1000) {
      warnings.push({
        path: 'eventBus.timeout',
        message: 'Low timeout with high queue size may cause timeouts under load',
        value: config.eventBus.timeout,
        suggestion: 'Increase timeout or decrease queue size',
      });
    }

    // Check retry configuration
    if (config.eventBus.retryOnFailure && config.eventBus.maxRetries === 0) {
      warnings.push({
        path: 'eventBus.maxRetries',
        message: 'Retry enabled but maxRetries is 0',
        value: 0,
        suggestion: 'Set maxRetries > 0',
      });
    }

    // Check metrics interval vs retention
    const metrics = config.metrics as { collectionIntervalMs?: number; sampleRetentionMs?: number } | undefined;
    if (metrics?.collectionIntervalMs !== undefined && metrics?.sampleRetentionMs !== undefined && metrics.collectionIntervalMs > metrics.sampleRetentionMs) {
      warnings.push({
        path: 'metrics.collectionIntervalMs',
        message: 'Collection interval exceeds sample retention period',
        value: metrics.collectionIntervalMs,
        suggestion: 'Increase sampleRetentionMs or decrease collectionIntervalMs',
      });
    }

    // Check health check interval
    const healthCheck = config.healthCheck as { intervalMs?: number } | undefined;
    if (healthCheck?.intervalMs !== undefined && healthCheck.intervalMs < 5000) {
      warnings.push({
        path: 'healthCheck.intervalMs',
        message: 'Very frequent health checks may impact performance',
        value: healthCheck.intervalMs,
        suggestion: 'Consider interval >= 5000ms',
      });
    }

    // Check HTTP adapter endpoints (warn, not error)
    if (config.adapter.type === 'http') {
      const httpConfig = config.adapter.config as { endpoints?: unknown[] };
      if (httpConfig.endpoints !== undefined && httpConfig.endpoints.length === 0) {
        warnings.push({
          path: 'adapter.config.endpoints',
          message: 'HTTP adapter has no endpoints configured',
          value: [],
          suggestion: 'Add at least one endpoint',
        });
      }
    }


  }

  /**
   * Gets value at path in object.
   */
  private _getValueAtPath(obj: unknown, path: (string | number)[]): unknown {
    let current: unknown = obj;
    for (const key of path) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[String(key)];
    }
    return current;
  }

  /**
   * Gets expected type from Zod issue.
   */
  private _getExpectedType(issue: z.ZodIssue): string {
    switch (issue.code) {
      case 'invalid_type':
        return `expected ${issue.expected}, received ${issue.received}`;
      case 'invalid_enum_value':
        return `expected one of: ${issue.options.join(', ')}`;
      case 'too_small':
        return `minimum ${issue.minimum}${issue.inclusive ? '' : ' (exclusive)'}`;
      case 'too_big':
        return `maximum ${issue.maximum}${issue.inclusive ? '' : ' (exclusive)'}`;
      default:
        return issue.message;
    }
  }
}