/**
 * Domain Strategy Factory
 *
 * Factory for creating Domain strategies by name and profile.
 * Supports profile-based strategy creation for different environments.
 */

import { IDomainStrategy } from '../strategies/IDomainStrategy';
import { DefaultDomainStrategy } from '../strategies/DefaultDomainStrategy';
import { DomainDefaultStrategy } from '../strategies/DefaultStrategy';
import { DomainFastStrategy } from '../strategies/FastStrategy';
import { DomainReliableStrategy } from '../strategies/ReliableStrategy';
import { DomainCachedStrategy } from '../strategies/CachedStrategy';
import { DomainBatchStrategy } from '../strategies/BatchStrategy';
import { EventSourcingDomainStrategy } from '../strategies/EventSourcingDomainStrategy';
import { LoggingDomainStrategy, ILogger } from '../strategies/LoggingDomainStrategy';
import { MetricsDomainStrategy, StrategyMetricsSnapshot } from '../strategies/MetricsDomainStrategy';
import { DomainMetricsCollector } from '../metrics/DomainMetricsCollector';
import { DomainHealthCheck } from '../health/DomainHealthCheck';
import { DomainManager } from '../implementations/DomainManager';

export type DomainProfile = 'development' | 'staging' | 'production' | 'test';

export interface DomainStrategyFactoryConfig {
  /** Default logger for logging strategies */
  defaultLogger?: ILogger;
  /** Metrics collector for metrics strategies */
  metricsCollector?: DomainMetricsCollector;
  /** Domain manager for event sourcing strategies */
  domainManager?: DomainManager;
  /** Health check for monitoring strategies */
  healthCheck?: DomainHealthCheck;
  /** Custom strategy factories */
  customStrategies?: Map<string, () => IDomainStrategy<unknown, unknown>>;
}

export interface StrategyProfileConfig {
  /** Base strategy name */
  baseStrategy: string;
  /** Whether to wrap with logging */
  withLogging: boolean;
  /** Whether to wrap with metrics */
  withMetrics: boolean;
  /** Whether to use event sourcing */
  withEventSourcing: boolean;
  /** Custom options */
  options?: Record<string, unknown>;
}

export const DEFAULT_PROFILE_CONFIGS: Record<DomainProfile, StrategyProfileConfig> = {
  development: {
    baseStrategy: 'default',
    withLogging: true,
    withMetrics: true,
    withEventSourcing: false,
    options: { logLevel: 'debug' },
  },
  staging: {
    baseStrategy: 'default',
    withLogging: true,
    withMetrics: true,
    withEventSourcing: true,
    options: { logLevel: 'info' },
  },
  production: {
    baseStrategy: 'default',
    withLogging: true,
    withMetrics: true,
    withEventSourcing: true,
    options: { logLevel: 'warn' },
  },
  test: {
    baseStrategy: 'default',
    withLogging: false,
    withMetrics: false,
    withEventSourcing: false,
    options: { logLevel: 'error' },
  },
};

export class DomainStrategyFactory {
  private _strategies: Map<string, () => IDomainStrategy<unknown, unknown>>;
  private _config: DomainStrategyFactoryConfig;
  private _profileConfigs: Record<DomainProfile, StrategyProfileConfig>;

  constructor(config: DomainStrategyFactoryConfig = {}) {
    this._config = config;
    this._profileConfigs = { ...DEFAULT_PROFILE_CONFIGS };
    this._strategies = new Map();
    this._registerBuiltinStrategies();
    this._registerCustomStrategies();
  }

  private _registerBuiltinStrategies(): void {
    this._strategies.set('default', () => new DefaultDomainStrategy());
    this._strategies.set('fast', () => new DomainFastStrategy());
    this._strategies.set('reliable', () => new DomainReliableStrategy());
    this._strategies.set('cached', () => new DomainCachedStrategy());
    this._strategies.set('batch', () => new DomainBatchStrategy());
    this._strategies.set('event-sourcing', () => new EventSourcingDomainStrategy());
  }

  private _registerCustomStrategies(): void {
    if (this._config.customStrategies) {
      for (const [name, factory] of this._config.customStrategies.entries()) {
        this._strategies.set(name, factory);
      }
    }
  }

  /**
   * Creates a strategy by name.
   *
   * @param name - Strategy name
   * @returns Strategy instance
   * @throws Error if strategy not found
   */
  create(name: string): IDomainStrategy<unknown, unknown> {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);
    if (!factory) {
      throw new Error(`Unknown domain strategy: ${name}. Available: ${this.getAvailableStrategies().join(', ')}`);
    }
    return factory();
  }

  /**
   * Creates the default strategy.
   */
  createDefault(): IDomainStrategy<unknown, unknown> {
    return this.create('default');
  }

  /**
   * Creates an event-sourced strategy.
   */
  createEventSourced(): IDomainStrategy<unknown, unknown> {
    return this.create('event-sourcing');
  }

  /**
   * Creates a logged strategy wrapping the default strategy.
   */
  createLogged(logger?: ILogger): IDomainStrategy<unknown, unknown> {
    const inner = this.createDefault();
    const log = logger ?? this._config.defaultLogger;
    if (!log) {
      throw new Error('Logger required for logged strategy');
    }
    return new LoggingDomainStrategy(inner, log);
  }

  /**
   * Creates a metrics-enabled strategy wrapping the default strategy.
   */
  createMetrics(metricsCollector?: DomainMetricsCollector): IDomainStrategy<unknown, unknown> {
    const inner = this.createDefault();
    const collector = metricsCollector ?? this._config.metricsCollector;
    if (!collector) {
      throw new Error('Metrics collector required for metrics strategy');
    }
    return new MetricsDomainStrategy(inner);
  }

  /**
   * Creates a fully wrapped strategy with logging and metrics.
   */
  createLoggedAndMetrics(
    logger?: ILogger,
    metricsCollector?: DomainMetricsCollector
  ): IDomainStrategy<unknown, unknown> {
    let strategy = this.createDefault();

    const log = logger ?? this._config.defaultLogger;
    if (log) {
      strategy = new LoggingDomainStrategy(strategy, log);
    }

    const collector = metricsCollector ?? this._config.metricsCollector;
    if (collector) {
      strategy = new MetricsDomainStrategy(strategy);
    }

    return strategy;
  }

  /**
   * Creates a strategy for a specific profile.
   *
   * @param profile - Environment profile
   * @param overrides - Optional configuration overrides
   * @returns Configured strategy for the profile
   */
  createForProfile(
    profile: DomainProfile,
    overrides: Partial<StrategyProfileConfig> = {}
  ): IDomainStrategy<unknown, unknown> {
    const profileConfig = { ...this._profileConfigs[profile], ...overrides };

    let strategy = this.create(profileConfig.baseStrategy);

    if (profileConfig.withEventSourcing) {
      const eventSourced = this.create('event-sourcing');
      // Wrap the base strategy with event sourcing capabilities
      // For now, we'll use the event-sourced strategy directly
      strategy = eventSourced;
    }

    if (profileConfig.withLogging) {
      const logger = this._config.defaultLogger;
      if (logger) {
        strategy = new LoggingDomainStrategy(strategy, logger, `[Domain:${profile}]`);
      }
    }

    if (profileConfig.withMetrics) {
      const collector = this._config.metricsCollector;
      if (collector) {
        strategy = new MetricsDomainStrategy(strategy);
      }
    }

    return strategy;
  }

  /**
   * Creates a strategy with custom wrapping.
   */
  createCustom(
    baseStrategyName: string,
    options: {
      withLogging?: boolean;
      withMetrics?: boolean;
      logger?: ILogger;
      metricsCollector?: DomainMetricsCollector;
      logPrefix?: string;
    } = {}
  ): IDomainStrategy<unknown, unknown> {
    let strategy = this.create(baseStrategyName);

    if (options.withLogging) {
      const logger = options.logger ?? this._config.defaultLogger;
      if (logger) {
        strategy = new LoggingDomainStrategy(strategy, logger, options.logPrefix);
      }
    }

    if (options.withMetrics) {
      const collector = options.metricsCollector ?? this._config.metricsCollector;
      if (collector) {
        strategy = new MetricsDomainStrategy(strategy);
      }
    }

    return strategy;
  }

  /**
   * Registers a custom strategy factory.
   */
  registerStrategy(name: string, factory: () => IDomainStrategy<unknown, unknown>): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  /**
   * Registers a custom strategy class.
   */
  registerStrategyClass<TInput = unknown, TOutput = unknown>(
    name: string,
    StrategyClass: new () => IDomainStrategy<TInput, TOutput>
  ): void {
    this._strategies.set(name.toLowerCase(), () => new StrategyClass());
  }

  /**
   * Updates the profile configuration.
   */
  updateProfileConfig(profile: DomainProfile, config: Partial<StrategyProfileConfig>): void {
    this._profileConfigs[profile] = { ...this._profileConfigs[profile], ...config };
  }

  /**
   * Gets the profile configuration.
   */
  getProfileConfig(profile: DomainProfile): StrategyProfileConfig {
    return { ...this._profileConfigs[profile] };
  }

  /**
   * Gets all profile configurations.
   */
  getAllProfileConfigs(): Record<DomainProfile, StrategyProfileConfig> {
    return { ...this._profileConfigs };
  }

  /**
   * Gets available strategy names.
   */
  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  /**
   * Creates all registered strategies.
   */
  createAll(): IDomainStrategy<unknown, unknown>[] {
    return Array.from(this._strategies.values()).map((f) => f());
  }

  /**
   * Creates all strategies sorted by priority.
   */
  createByPriority(): IDomainStrategy<unknown, unknown>[] {
    return this.createAll().sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * Creates strategies for all profiles.
   */
  createForAllProfiles(): Record<DomainProfile, IDomainStrategy<unknown, unknown>> {
    const profiles: DomainProfile[] = ['development', 'staging', 'production', 'test'];
    const result: Partial<Record<DomainProfile, IDomainStrategy<unknown, unknown>>> = {};

    for (const profile of profiles) {
      result[profile] = this.createForProfile(profile);
    }

    return result as Record<DomainProfile, IDomainStrategy<unknown, unknown>>;
  }

  /**
   * Gets the default logger.
   */
  getDefaultLogger(): ILogger | undefined {
    return this._config.defaultLogger;
  }

  /**
   * Sets the default logger.
   */
  setDefaultLogger(logger: ILogger): void {
    this._config.defaultLogger = logger;
  }

  /**
   * Gets the metrics collector.
   */
  getMetricsCollector(): DomainMetricsCollector | undefined {
    return this._config.metricsCollector;
  }

  /**
   * Sets the metrics collector.
   */
  setMetricsCollector(collector: DomainMetricsCollector): void {
    this._config.metricsCollector = collector;
  }

  /**
   * Gets the domain manager.
   */
  getDomainManager(): DomainManager | undefined {
    return this._config.domainManager;
  }

  /**
   * Sets the domain manager.
   */
  setDomainManager(manager: DomainManager): void {
    this._config.domainManager = manager;
  }
}

/**
 * Creates a default factory with common configuration.
 */
export function createDefaultFactory(config: DomainStrategyFactoryConfig = {}): DomainStrategyFactory {
  return new DomainStrategyFactory(config);
}

/**
 * Creates a factory configured for a specific profile.
 */
export function createFactoryForProfile(
  profile: DomainProfile,
  config: DomainStrategyFactoryConfig = {}
): DomainStrategyFactory {
  const factory = new DomainStrategyFactory(config);
  return factory;
}
