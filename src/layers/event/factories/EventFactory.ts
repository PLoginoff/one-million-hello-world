/**
 * Event Factory
 *
 * Profile-based factory for creating event bus instances with different configurations.
 *
 * @module EventLayer/Factories
 */

import { InMemoryEventBusAdapter, type InMemoryEventBusAdapterConfig } from '../adapters/InMemoryEventBusAdapter';
import { RedisEventAdapter, type RedisEventAdapterConfig } from '../adapters/RedisEventAdapter';
import { HttpEventAdapter, type HttpEventAdapterConfig } from '../adapters/HttpEventAdapter';
import { KafkaEventAdapter, type KafkaEventAdapterConfig } from '../adapters/KafkaEventAdapter';
import { IEventBus } from '../interfaces/IEventBus';
import { EventDefaultStrategy } from '../strategies/DefaultStrategy';
import { EventFastStrategy } from '../strategies/FastStrategy';
import { EventReliableStrategy } from '../strategies/ReliableStrategy';
import { EventCachedStrategy } from '../strategies/CachedStrategy';
import { EventBatchStrategy } from '../strategies/BatchStrategy';
import { EventBroadcastStrategy } from '../strategies/BroadcastEventStrategy';
import { EventFilteredStrategy } from '../strategies/FilteredEventStrategy';
import { EventPrioritizedStrategy } from '../strategies/PrioritizedEventStrategy';
import { EventDeadLetterStrategy } from '../strategies/DeadLetterEventStrategy';
import { LoggingEventStrategy } from '../strategies/LoggingEventStrategy';
import { MetricsEventStrategy } from '../strategies/MetricsEventStrategy';
import { EventStrategyFactory } from './EventStrategyFactory';
import { EventBusConfig, EventBusConfigOptions } from '../configuration/EventBusConfig';

/**
 * Event bus profile types.
 */
export type EventBusProfile = 'development' | 'testing' | 'staging' | 'production' | 'high-throughput' | 'low-latency' | 'reliable';

/**
 * Event factory configuration.
 */
export interface EventFactoryConfig {
  /** Profile to use */
  profile?: EventBusProfile;
  /** Custom adapter configuration */
  adapter?: {
    type: 'memory' | 'redis' | 'http' | 'kafka';
    config: InMemoryEventBusAdapterConfig | RedisEventAdapterConfig | HttpEventAdapterConfig | KafkaEventAdapterConfig;
  };
  /** Strategy to use */
  strategy?: string;
  /** Enable logging decorator */
  enableLogging?: boolean;
  /** Enable metrics decorator */
  enableMetrics?: boolean;
  /** Event bus configuration */
  eventBusConfig?: EventBusConfigOptions;
}

/**
 * Event Factory for creating configured event bus instances.
 */
export class EventFactory {
  private static _strategyFactory: EventStrategyFactory;

  static {
    EventFactory._strategyFactory = new EventStrategyFactory();
  }

  /**
   * Creates an event bus instance based on profile.
   *
   * @param profile - The profile to use
   * @param overrides - Optional configuration overrides
   * @returns Configured event bus instance
   */
  static create(profile: EventBusProfile = 'development', overrides: Partial<EventFactoryConfig> = {}): IEventBus {
    const config = this._getProfileConfig(profile);
    const mergedConfig = { ...config, ...overrides };

    return this._createFromConfig(mergedConfig);
  }

  /**
   * Creates an event bus for development.
   */
  static createDevelopment(overrides: Partial<EventFactoryConfig> = {}): IEventBus {
    return this.create('development', overrides);
  }

  /**
   * Creates an event bus for testing.
   */
  static createTesting(overrides: Partial<EventFactoryConfig> = {}): IEventBus {
    return this.create('testing', overrides);
  }

  /**
   * Creates an event bus for staging.
   */
  static createStaging(overrides: Partial<EventFactoryConfig> = {}): IEventBus {
    return this.create('staging', overrides);
  }

  /**
   * Creates an event bus for production.
   */
  static createProduction(overrides: Partial<EventFactoryConfig> = {}): IEventBus {
    return this.create('production', overrides);
  }

  /**
   * Creates an event bus optimized for high throughput.
   */
  static createHighThroughput(overrides: Partial<EventFactoryConfig> = {}): IEventBus {
    return this.create('high-throughput', overrides);
  }

  /**
   * Creates an event bus optimized for low latency.
   */
  static createLowLatency(overrides: Partial<EventFactoryConfig> = {}): IEventBus {
    return this.create('low-latency', overrides);
  }

  /**
   * Creates an event bus optimized for reliability.
   */
  static createReliable(overrides: Partial<EventFactoryConfig> = {}): IEventBus {
    return this.create('reliable', overrides);
  }

  /**
   * Creates an event bus from custom configuration.
   */
  static createCustom(config: EventFactoryConfig): IEventBus {
    return this._createFromConfig(config);
  }

  /**
   * Creates an event bus with a specific adapter.
   */
  static createWithAdapter(
    adapterType: 'memory' | 'redis' | 'http' | 'kafka',
    adapterConfig: InMemoryEventBusAdapterConfig | RedisEventAdapterConfig | HttpEventAdapterConfig | KafkaEventAdapterConfig,
    options: { strategy?: string; enableLogging?: boolean; enableMetrics?: boolean } = {}
  ): IEventBus {
    return this._createFromConfig({
      adapter: { type: adapterType, config: adapterConfig },
      strategy: options.strategy,
      enableLogging: options.enableLogging,
      enableMetrics: options.enableMetrics,
    });
  }

  /**
   * Gets the strategy factory instance.
   */
  static getStrategyFactory(): EventStrategyFactory {
    return EventFactory._strategyFactory;
  }

  /**
   * Registers a custom strategy.
   */
  static registerStrategy(name: string, factory: () => { name: string; priority: number; execute: (input: unknown) => Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>; canHandle: (input: unknown) => boolean }): void {
    EventFactory._strategyFactory.registerStrategy(name, factory);
  }

  /**
   * Creates event bus from merged configuration.
   */
  private static _createFromConfig(config: EventFactoryConfig): IEventBus {
    // Create adapter
    let adapter: IEventBus;

    if (config.adapter) {
      adapter = this._createAdapter(config.adapter.type, config.adapter.config);
    } else {
      // Default to in-memory
      adapter = new InMemoryEventBusAdapter();
    }

    // Apply event bus configuration
    if (config.eventBusConfig) {
      adapter.setConfig(new EventBusConfig(config.eventBusConfig));
    }

    // Wrap with strategy if specified
    if (config.strategy) {
      const strategy = EventFactory._strategyFactory.create(config.strategy);
      // Note: In a real implementation, we'd wrap the adapter with the strategy
      // For now, we just return the adapter
    }

    // Apply decorators
    if (config.enableLogging) {
      // Would wrap with LoggingEventStrategy
    }

    if (config.enableMetrics) {
      // Would wrap with MetricsEventStrategy
    }

    return adapter;
  }

  /**
   * Creates an adapter instance.
   */
  private static _createAdapter(
    type: 'memory' | 'redis' | 'http' | 'kafka',
    config: InMemoryEventBusAdapterConfig | RedisEventAdapterConfig | HttpEventAdapterConfig | KafkaEventAdapterConfig
  ): IEventBus {
    switch (type) {
      case 'memory':
        return new InMemoryEventBusAdapter(config as InMemoryEventBusAdapterConfig);
      case 'redis':
        return new RedisEventAdapter(config as RedisEventAdapterConfig);
      case 'http':
        return new HttpEventAdapter(config as HttpEventAdapterConfig);
      case 'kafka':
        return new KafkaEventAdapter(config as KafkaEventAdapterConfig);
      default:
        throw new Error(`Unknown adapter type: ${type}`);
    }
  }

  /**
   * Gets configuration for a profile.
   */
  private static _getProfileConfig(profile: EventBusProfile): EventFactoryConfig {
    const baseConfig: EventFactoryConfig = {
      eventBusConfig: EventBusConfig.default().toJSON() as EventBusConfigOptions,
    };

    switch (profile) {
      case 'development':
        return {
          ...baseConfig,
          adapter: { type: 'memory', config: { enableAsync: true, enablePersistence: false, maxEventHistory: 100, maxSubscriptions: 1000, defaultTimeoutMs: 5000 } },
          strategy: 'default',
          enableLogging: true,
          enableMetrics: true,
          eventBusConfig: { enableAsync: true, enablePersistence: false, logLevel: 'debug', maxRetries: 1 },
        };

      case 'testing':
        return {
          ...baseConfig,
          adapter: { type: 'memory', config: { enableAsync: false, enablePersistence: false, maxEventHistory: 50, maxSubscriptions: 100, defaultTimeoutMs: 1000 } },
          strategy: 'fast',
          enableLogging: false,
          enableMetrics: false,
          eventBusConfig: { enableAsync: false, enablePersistence: false, logLevel: 'error', maxRetries: 0 },
        };

      case 'staging':
        return {
          ...baseConfig,
          adapter: { type: 'redis', config: { host: 'localhost', port: 6379, keyPrefix: 'staging:events:' } },
          strategy: 'reliable',
          enableLogging: true,
          enableMetrics: true,
          eventBusConfig: { enableAsync: true, enablePersistence: true, logLevel: 'info', maxRetries: 3 },
        };

      case 'production':
        return {
          ...baseConfig,
          adapter: { type: 'redis', config: { host: process.env.REDIS_HOST ?? 'localhost', port: 6379, keyPrefix: 'prod:events:' } },
          strategy: 'reliable',
          enableLogging: true,
          enableMetrics: true,
          eventBusConfig: { enableAsync: true, enablePersistence: true, logLevel: 'warn', maxRetries: 5 },
        };

      case 'high-throughput':
        return {
          ...baseConfig,
          adapter: { type: 'kafka', config: { producer: { brokers: ['localhost:9092'] }, consumer: { brokers: ['localhost:9092'], groupId: 'high-throughput', topics: ['events'] } } },
          strategy: 'batch',
          enableLogging: false,
          enableMetrics: true,
          eventBusConfig: { enableAsync: true, enablePersistence: true, logLevel: 'warn', maxRetries: 2 },
        };

      case 'low-latency':
        return {
          ...baseConfig,
          adapter: { type: 'memory', config: { enableAsync: true, enablePersistence: false, maxEventHistory: 0, maxSubscriptions: 10000, defaultTimeoutMs: 1000 } },
          strategy: 'fast',
          enableLogging: false,
          enableMetrics: false,
          eventBusConfig: { enableAsync: true, enablePersistence: false, logLevel: 'error', maxRetries: 0, timeout: 1000 },
        };

      case 'reliable':
        return {
          ...baseConfig,
          adapter: { type: 'redis', config: { host: 'localhost', port: 6379, keyPrefix: 'reliable:events:' } },
          strategy: 'reliable',
          enableLogging: true,
          enableMetrics: true,
          eventBusConfig: { enableAsync: true, enablePersistence: true, logLevel: 'info', maxRetries: 10, timeout: 30000 },
        };

      default:
        return baseConfig;
    }
  }
}