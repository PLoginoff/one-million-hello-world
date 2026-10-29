/**
 * Event Configuration Builder
 *
 * Fluent builder for event layer configuration with profile support.
 *
 * @module EventLayer/Configuration
 */

import { EventBusConfig, EventBusConfigOptions } from '../EventBusConfig';
import { DEFAULT_EVENT_BUS_CONFIG } from '../defaults/EventDefaults';

/**
 * Event configuration profile.
 */
export type EventConfigProfile = 'development' | 'testing' | 'staging' | 'production' | 'high-throughput' | 'low-latency' | 'reliable';

/**
 * Complete event configuration.
 */
export interface EventConfiguration {
  /** Event bus configuration */
  eventBus: EventBusConfigOptions;
  /** Adapter configuration */
  adapter: {
    type: 'memory' | 'redis' | 'http' | 'kafka';
    config: Record<string, unknown>;
  };
  /** Strategy configuration */
  strategy: {
    name: string;
    config: Record<string, unknown>;
  };
  /** Metrics configuration */
  metrics: {
    enabled: boolean;
    config: Record<string, unknown>;
  };
  /** Health check configuration */
  healthCheck: {
    enabled: boolean;
    config: Record<string, unknown>;
  };
  /** Logging configuration */
  logging: {
    enabled: boolean;
    level: string;
    config: Record<string, unknown>;
  };
}

/**
 * Event Configuration Builder.
 * Provides fluent API for building event layer configuration.
 */
export class EventConfigBuilder {
  private _profile: EventConfigProfile = 'development';
  private _eventBusConfig: Partial<EventBusConfigOptions> = {};
  private _adapterType: 'memory' | 'redis' | 'http' | 'kafka' = 'memory';
  private _adapterConfig: Record<string, unknown> = {};
  private _strategyName: string = 'default';
  private _strategyConfig: Record<string, unknown> = {};
  private _metricsEnabled: boolean = true;
  private _metricsConfig: Record<string, unknown> = {};
  private _healthCheckEnabled: boolean = true;
  private _healthCheckConfig: Record<string, unknown> = {};
  private _loggingEnabled: boolean = true;
  private _loggingLevel: string = 'info';
  private _loggingConfig: Record<string, unknown> = {};

  /**
   * Sets the configuration profile.
   */
  profile(profile: EventConfigProfile): this {
    this._profile = profile;
    this._applyProfileDefaults(profile);
    return this;
  }

  /**
   * Sets event bus configuration.
   */
  eventBus(config: Partial<EventBusConfigOptions>): this {
    this._eventBusConfig = { ...this._eventBusConfig, ...config };
    return this;
  }

  /**
   * Enables/disables async event processing.
   */
  enableAsync(enabled: boolean = true): this {
    this._eventBusConfig.enableAsync = enabled;
    return this;
  }

  /**
   * Enables/disables event persistence.
   */
  enablePersistence(enabled: boolean = true): this {
    this._eventBusConfig.enablePersistence = enabled;
    return this;
  }

  /**
   * Sets maximum queue size.
   */
  maxQueueSize(size: number): this {
    this._eventBusConfig.maxQueueSize = size;
    return this;
  }

  /**
   * Sets maximum subscriptions.
   */
  maxSubscriptions(count: number): this {
    this._eventBusConfig.maxSubscriptions = count;
    return this;
  }

  /**
   * Sets operation timeout.
   */
  timeout(ms: number): this {
    this._eventBusConfig.timeout = ms;
    return this;
  }

  /**
   * Enables/disables retry on failure.
   */
  retryOnFailure(enabled: boolean = true): this {
    this._eventBusConfig.retryOnFailure = enabled;
    return this;
  }

  /**
   * Sets maximum retries.
   */
  maxRetries(count: number): this {
    this._eventBusConfig.maxRetries = count;
    return this;
  }

  /**
   * Enables/disables metrics.
   */
  enableMetrics(enabled: boolean = true): this {
    this._metricsEnabled = enabled;
    return this;
  }

  /**
   * Sets metrics configuration.
   */
  metricsConfig(config: Record<string, unknown>): this {
    this._metricsConfig = { ...this._metricsConfig, ...config };
    return this;
  }

  /**
   * Enables/disables health checks.
   */
  enableHealthCheck(enabled: boolean = true): this {
    this._healthCheckEnabled = enabled;
    return this;
  }

  /**
   * Sets health check configuration.
   */
  healthCheckConfig(config: Record<string, unknown>): this {
    this._healthCheckConfig = { ...this._healthCheckConfig, ...config };
    return this;
  }

  /**
   * Enables/disables logging.
   */
  enableLogging(enabled: boolean = true): this {
    this._loggingEnabled = enabled;
    return this;
  }

  /**
   * Sets log level.
   */
  logLevel(level: 'debug' | 'info' | 'warn' | 'error'): this {
    this._loggingLevel = level;
    return this;
  }

  /**
   * Sets logging configuration.
   */
  loggingConfig(config: Record<string, unknown>): this {
    this._loggingConfig = { ...this._loggingConfig, ...config };
    return this;
  }

  /**
   * Sets adapter type and configuration.
   */
  adapter(type: 'memory' | 'redis' | 'http' | 'kafka', config: Record<string, unknown> = {}): this {
    this._adapterType = type;
    this._adapterConfig = config;
    return this;
  }

  /**
   * Configures in-memory adapter.
   */
  inMemoryAdapter(config: Record<string, unknown> = {}): this {
    return this.adapter('memory', config);
  }

  /**
   * Configures Redis adapter.
   */
  redisAdapter(config: Record<string, unknown> = {}): this {
    return this.adapter('redis', config);
  }

  /**
   * Configures HTTP adapter.
   */
  httpAdapter(config: Record<string, unknown> = {}): this {
    return this.adapter('http', config);
  }

  /**
   * Configures Kafka adapter.
   */
  kafkaAdapter(config: Record<string, unknown> = {}): this {
    return this.adapter('kafka', config);
  }

  /**
   * Sets strategy.
   */
  strategy(name: string, config: Record<string, unknown> = {}): this {
    this._strategyName = name;
    this._strategyConfig = config;
    return this;
  }

  /**
   * Uses default strategy.
   */
  defaultStrategy(config: Record<string, unknown> = {}): this {
    return this.strategy('default', config);
  }

  /**
   * Uses fast strategy.
   */
  fastStrategy(config: Record<string, unknown> = {}): this {
    return this.strategy('fast', config);
  }

  /**
   * Uses reliable strategy.
   */
  reliableStrategy(config: Record<string, unknown> = {}): this {
    return this.strategy('reliable', config);
  }

  /**
   * Uses cached strategy.
   */
  cachedStrategy(config: Record<string, unknown> = {}): this {
    return this.strategy('cached', config);
  }

  /**
   * Uses batch strategy.
   */
  batchStrategy(config: Record<string, unknown> = {}): this {
    return this.strategy('batch', config);
  }

  /**
   * Uses broadcast strategy.
   */
  broadcastStrategy(config: Record<string, unknown> = {}): this {
    return this.strategy('broadcast', config);
  }

  /**
   * Uses filtered strategy.
   */
  filteredStrategy(config: Record<string, unknown> = {}): this {
    return this.strategy('filtered', config);
  }

  /**
   * Uses prioritized strategy.
   */
  prioritizedStrategy(config: Record<string, unknown> = {}): this {
    return this.strategy('prioritized', config);
  }

  /**
   * Uses dead letter strategy.
   */
  deadLetterStrategy(config: Record<string, unknown> = {}): this {
    return this.strategy('dead-letter', config);
  }

  /**
   * Builds the complete configuration.
   */
  build(): EventConfiguration {
    const eventBus = new EventBusConfig({ ...DEFAULT_EVENT_BUS_CONFIG, ...this._eventBusConfig });
    return {
      eventBus: eventBus.toJSON() as EventBusConfigOptions,
      adapter: {
        type: this._adapterType,
        config: this._adapterConfig,
      },
      strategy: {
        name: this._strategyName,
        config: this._strategyConfig,
      },
      metrics: {
        enabled: this._metricsEnabled,
        config: this._metricsConfig,
      },
      healthCheck: {
        enabled: this._healthCheckEnabled,
        config: this._healthCheckConfig,
      },
      logging: {
        enabled: this._loggingEnabled,
        level: this._loggingLevel,
        config: this._loggingConfig,
      },
    };
  }

  /**
   * Builds and creates an EventBusConfig instance.
   */
  buildEventBusConfig(): EventBusConfig {
    return new EventBusConfig(this._eventBusConfig);
  }

  /**
   * Applies profile-specific defaults.
   */
  private _applyProfileDefaults(profile: EventConfigProfile): void {
    switch (profile) {
      case 'development':
        this._eventBusConfig = {
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
        };
        this._adapterType = 'memory';
        this._adapterConfig = { enableAsync: true, enablePersistence: false, maxEventHistory: 100 };
        this._strategyName = 'default';
        this._metricsEnabled = true;
        this._healthCheckEnabled = true;
        this._loggingEnabled = true;
        this._loggingLevel = 'debug';
        break;

      case 'testing':
        this._eventBusConfig = {
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
        };
        this._adapterType = 'memory';
        this._adapterConfig = { enableAsync: false, enablePersistence: false, maxEventHistory: 0 };
        this._strategyName = 'fast';
        this._metricsEnabled = false;
        this._healthCheckEnabled = false;
        this._loggingEnabled = false;
        this._loggingLevel = 'error';
        break;

      case 'staging':
        this._eventBusConfig = {
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
        };
        this._adapterType = 'redis';
        this._adapterConfig = { host: 'localhost', port: 6379, keyPrefix: 'staging:events:' };
        this._strategyName = 'reliable';
        this._metricsEnabled = true;
        this._healthCheckEnabled = true;
        this._loggingEnabled = true;
        this._loggingLevel = 'info';
        break;

      case 'production':
        this._eventBusConfig = {
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
        };
        this._adapterType = 'redis';
        this._adapterConfig = { host: process.env.REDIS_HOST ?? 'localhost', port: 6379, keyPrefix: 'prod:events:' };
        this._strategyName = 'reliable';
        this._metricsEnabled = true;
        this._healthCheckEnabled = true;
        this._loggingEnabled = true;
        this._loggingLevel = 'warn';
        break;

      case 'high-throughput':
        this._eventBusConfig = {
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
        };
        this._adapterType = 'kafka';
        this._adapterConfig = {
          producer: { brokers: ['localhost:9092'], clientId: 'high-throughput' },
          consumer: { brokers: ['localhost:9092'], groupId: 'high-throughput', topics: ['events'] },
        };
        this._strategyName = 'batch';
        this._metricsEnabled = true;
        this._healthCheckEnabled = true;
        this._loggingEnabled = false;
        this._loggingLevel = 'warn';
        break;

      case 'low-latency':
        this._eventBusConfig = {
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
        };
        this._adapterType = 'memory';
        this._adapterConfig = { enableAsync: true, enablePersistence: false, maxEventHistory: 0 };
        this._strategyName = 'fast';
        this._metricsEnabled = false;
        this._healthCheckEnabled = false;
        this._loggingEnabled = false;
        this._loggingLevel = 'error';
        break;

      case 'reliable':
        this._eventBusConfig = {
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
        };
        this._adapterType = 'redis';
        this._adapterConfig = { host: 'localhost', port: 6379, keyPrefix: 'reliable:events:' };
        this._strategyName = 'reliable';
        this._metricsEnabled = true;
        this._healthCheckEnabled = true;
        this._loggingEnabled = true;
        this._loggingLevel = 'info';
        break;
    }
  }

  /**
   * Creates a builder with development defaults.
   */
  static development(): EventConfiguration & { build(): EventConfiguration } {
    const config = new EventConfigBuilder().profile('development').build();
    return Object.assign(config, { build: () => config });
  }

  /**
   * Creates a builder with testing defaults.
   */
  static testing(): EventConfiguration & { build(): EventConfiguration } {
    const config = new EventConfigBuilder().profile('testing').build();
    return Object.assign(config, { build: () => config });
  }

  /**
   * Creates a builder with staging defaults.
   */
  static staging(): EventConfiguration & { build(): EventConfiguration } {
    const config = new EventConfigBuilder().profile('staging').build();
    return Object.assign(config, { build: () => config });
  }

  /**
   * Creates a builder with production defaults.
   */
  static production(): EventConfiguration & { build(): EventConfiguration } {
    const config = new EventConfigBuilder().profile('production').build();
    return Object.assign(config, { build: () => config });
  }

  /**
   * Creates a builder with high-throughput defaults.
   */
  static highThroughput(): EventConfiguration & { build(): EventConfiguration } {
    const config = new EventConfigBuilder().profile('high-throughput').build();
    return Object.assign(config, { build: () => config });
  }

  /**
   * Creates a builder with low-latency defaults.
   */
  static lowLatency(): EventConfiguration & { build(): EventConfiguration } {
    const config = new EventConfigBuilder().profile('low-latency').build();
    return Object.assign(config, { build: () => config });
  }

  /**
   * Creates a builder with reliable defaults.
   */
  static reliable(): EventConfiguration & { build(): EventConfiguration } {
    const config = new EventConfigBuilder().profile('reliable').build();
    return Object.assign(config, { build: () => config });
  }

  /**
   * Builds the configuration directly (shorthand for new EventConfigBuilder().profile(p).build()).
   */
  static forProfile(profile: EventConfigProfile): EventConfiguration {
    return new EventConfigBuilder().profile(profile).build();
  }

  /**
   * Gets the built configuration (shorthand for build()).
   */
  get config(): EventConfiguration {
    return this.build();
  }

  /**
   * Gets the event bus config from the built configuration.
   */
  get builtEventBus(): EventBusConfigOptions {
    return this.build().eventBus;
  }

  /**
   * Gets the adapter config from the built configuration.
   */
  get builtAdapter(): { type: string; config: Record<string, unknown> } {
    return this.build().adapter;
  }

  /**
   * Gets the metrics config from the built configuration.
   */
  get builtMetrics(): { enabled: boolean; config: Record<string, unknown> } {
    return this.build().metrics;
  }

  /**
   * Gets the strategy config from the built configuration.
   */
  get builtStrategy(): { name: string; config: Record<string, unknown> } {
    return this.build().strategy;
  }

  /**
   * Gets the healthCheck config from the built configuration.
   */
  get builtHealthCheck(): { enabled: boolean; config: Record<string, unknown> } {
    return this.build().healthCheck;
  }

  /**
   * Gets the logging config from the built configuration.
   */
  get builtLogging(): { enabled: boolean; level: string; config: Record<string, unknown> } {
    return this.build().logging;
  }
}