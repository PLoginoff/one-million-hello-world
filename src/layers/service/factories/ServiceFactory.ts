/**
 * Service Factory
 *
 * Factory for creating service components, configurations, and strategies.
 */

import { ServiceConfigBuilder } from '../configuration/builders/ServiceConfigBuilder';
import { DefaultConfigs, ServiceConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { ServiceEntity } from '../domain/entities/ServiceEntity';
import { ServiceStatusValueObject } from '../domain/value-objects/ServiceStatusValueObject';
import { ServiceService } from '../domain/services/ServiceService';
import { ServiceDiscoveryService } from '../domain/services/ServiceDiscoveryService';
import { ServiceStatistics } from '../statistics/ServiceStatistics';
import { SynchronousServiceStrategy } from '../strategies/strategy/SynchronousServiceStrategy';
import { AsynchronousServiceStrategy } from '../strategies/strategy/AsynchronousServiceStrategy';
import { IServiceStrategy } from '../strategies/IServiceStrategy';
import { DefaultServiceStrategy } from '../strategies/DefaultServiceStrategy';
import { LoggingServiceStrategy, ILogger } from '../strategies/LoggingServiceStrategy';
import { MetricsServiceStrategy, StrategyMetricsSnapshot } from '../strategies/MetricsServiceStrategy';
import { RetryServiceStrategy, RetryOptions } from '../strategies/RetryServiceStrategy';
import { CachedServiceStrategy, CacheOptions } from '../strategies/CachedServiceStrategy';

export class ServiceFactory {
  /**
   * Create default service configuration
   */
  static createDefaultConfig(): ServiceConfigOptions {
    return ServiceConfigBuilder.create().build();
  }

  /**
   * Create development service configuration
   */
  static createDevelopmentConfig(): ServiceConfigOptions {
    return ServiceConfigBuilder.development().build();
  }

  /**
   * Create production service configuration
   */
  static createProductionConfig(): ServiceConfigOptions {
    return ServiceConfigBuilder.production().build();
  }

  /**
   * Create minimal service configuration
   */
  static createMinimalConfig(): ServiceConfigOptions {
    return ServiceConfigBuilder.minimal().build();
  }

  /**
   * Create custom service configuration
   */
  static createCustomConfig(options: Partial<ServiceConfigOptions>): ServiceConfigOptions {
    return ServiceConfigBuilder.create()
      .withAutoRegistration(options.enableAutoRegistration ?? DefaultConfigs.DEFAULT.enableAutoRegistration)
      .withHealthCheck(options.enableHealthCheck ?? DefaultConfigs.DEFAULT.enableHealthCheck)
      .withHealthCheckInterval(options.healthCheckInterval ?? DefaultConfigs.DEFAULT.healthCheckInterval)
      .withMaxServices(options.maxServices ?? DefaultConfigs.DEFAULT.maxServices)
      .withDiscovery(options.enableDiscovery ?? DefaultConfigs.DEFAULT.enableDiscovery)
      .build();
  }

  /**
   * Create service service
   */
  static createServiceService(): ServiceService {
    return new ServiceService();
  }

  /**
   * Create service discovery service
   */
  static createServiceDiscoveryService(): ServiceDiscoveryService {
    return new ServiceDiscoveryService();
  }

  /**
   * Create synchronous strategy
   */
  static createSynchronousStrategy(): SynchronousServiceStrategy {
    return new SynchronousServiceStrategy();
  }

  /**
   * Create asynchronous strategy
   */
  static createAsynchronousStrategy(): AsynchronousServiceStrategy {
    return new AsynchronousServiceStrategy();
  }

  /**
   * Create service statistics
   */
  static createServiceStatistics(): ServiceStatistics {
    return new ServiceStatistics();
  }

  /**
   * Create service entity
   */
  static createService(id: string, name: string, version: string): ServiceEntity {
    return ServiceEntity.createBasic(id, name, version);
  }

  /**
   * Create healthy status
   */
  static createHealthyStatus(): ServiceStatusValueObject {
    return ServiceStatusValueObject.healthy();
  }

  /**
   * Create degraded status
   */
  static createDegradedStatus(): ServiceStatusValueObject {
    return ServiceStatusValueObject.degraded();
  }

  /**
   * Create unhealthy status
   */
  static createUnhealthyStatus(): ServiceStatusValueObject {
    return ServiceStatusValueObject.unhealthy();
  }

  /**
   * Create complete service stack with default configuration
   */
  static createDefaultStack(): {
    config: ServiceConfigOptions;
    service: ServiceService;
    discovery: ServiceDiscoveryService;
    strategy: IServiceStrategy;
    statistics: ServiceStatistics;
  } {
    return {
      config: this.createDefaultConfig(),
      service: this.createServiceService(),
      discovery: this.createServiceDiscoveryService(),
      strategy: this.createSynchronousStrategy(),
      statistics: this.createServiceStatistics(),
    };
  }

  /**
   * Create development service stack
   */
  static createDevelopmentStack(): {
    config: ServiceConfigOptions;
    service: ServiceService;
    discovery: ServiceDiscoveryService;
    strategy: IServiceStrategy;
    statistics: ServiceStatistics;
  } {
    return {
      config: this.createDevelopmentConfig(),
      service: this.createServiceService(),
      discovery: this.createServiceDiscoveryService(),
      strategy: this.createSynchronousStrategy(),
      statistics: this.createServiceStatistics(),
    };
  }

  /**
   * Create production service stack
   */
  static createProductionStack(): {
    config: ServiceConfigOptions;
    service: ServiceService;
    discovery: ServiceDiscoveryService;
    strategy: IServiceStrategy;
    statistics: ServiceStatistics;
  } {
    return {
      config: this.createProductionConfig(),
      service: this.createServiceService(),
      discovery: this.createServiceDiscoveryService(),
      strategy: this.createAsynchronousStrategy(),
      statistics: this.createServiceStatistics(),
    };
  }

  // ========================================================================
  // Strategy Factory Methods
  // ========================================================================

  /**
   * Creates a default service strategy (no decorators).
   */
  static createDefaultStrategy(): DefaultServiceStrategy {
    return new DefaultServiceStrategy();
  }

  /**
   * Creates a logged service strategy.
   *
   * @param logger - Logger instance
   * @param logPrefix - Optional prefix for log messages
   */
  static createLoggedStrategy(logger: ILogger, logPrefix?: string): LoggingServiceStrategy {
    const base = this.createDefaultStrategy();
    return new LoggingServiceStrategy(base, logger, logPrefix);
  }

  /**
   * Creates a metrics-enabled service strategy.
   *
   * @param maxSamples - Maximum number of execution time samples to retain
   */
  static createMetricsStrategy(maxSamples?: number): MetricsServiceStrategy {
    const base = this.createDefaultStrategy();
    return new MetricsServiceStrategy(base, maxSamples);
  }

  /**
   * Creates a retried service strategy with exponential backoff.
   *
   * @param options - Optional retry configuration
   */
  static createRetriedStrategy(options?: Partial<RetryOptions>): RetryServiceStrategy {
    const base = this.createDefaultStrategy();
    return new RetryServiceStrategy(base, options);
  }

  /**
   * Creates a cached service strategy.
   *
   * @param options - Optional cache configuration
   */
  static createCachedStrategy(options?: Partial<CacheOptions>): CachedServiceStrategy {
    const base = this.createDefaultStrategy();
    return new CachedServiceStrategy(base, options);
  }

  /**
   * Creates a fully-featured strategy with all decorators.
   *
   * @param logger - Logger instance
   * @param options - Optional configuration for all decorators
   */
  static createFullStrategy(
    logger: ILogger,
    options?: {
      logging?: { logPrefix?: string } | false;
      metrics?: { maxSamples?: number } | false;
      retry?: Partial<RetryOptions> | false;
      cache?: Partial<CacheOptions> | false;
    }
  ): IServiceStrategy {
    let strategy: IServiceStrategy = this.createDefaultStrategy();

    if (options?.logging !== false) {
      strategy = new LoggingServiceStrategy(strategy, logger, options?.logging?.logPrefix);
    }

    if (options?.metrics !== false) {
      strategy = new MetricsServiceStrategy(strategy, options?.metrics?.maxSamples);
    }

    if (options?.retry !== false) {
      strategy = new RetryServiceStrategy(strategy, options?.retry);
    }

    if (options?.cache !== false) {
      strategy = new CachedServiceStrategy(strategy, options?.cache);
    }

    return strategy;
  }

  // ========================================================================
  // Profile-Based Factory Methods
  // ========================================================================

  /**
   * Environment profile type.
   */
  static readonly Profile = {
    DEVELOPMENT: 'development' as const,
    STAGING: 'staging' as const,
    PRODUCTION: 'production' as const,
    TEST: 'test' as const,
  } as const;

  /**
   * Type for environment profiles.
   */
  static ProfileType: 'development' | 'staging' | 'production' | 'test';

  /**
   * Creates a service stack configured for the specified profile.
   *
   * @param profile - Target environment profile
   * @param logger - Optional logger (required for non-test profiles)
   */
  static createForProfile(
    profile: ServiceFactory.ProfileType,
    logger?: ILogger
  ): {
    config: ServiceConfigOptions;
    service: ServiceService;
    discovery: ServiceDiscoveryService;
    strategy: IServiceStrategy;
    statistics: ServiceStatistics;
  } {
    let config: ServiceConfigOptions;
    let strategy: IServiceStrategy;

    switch (profile) {
      case 'development':
        config = this.createDevelopmentConfig();
        strategy = this.createFullStrategy(logger ?? this._createConsoleLogger(), {
          logging: { logPrefix: '[DEV]' },
          retry: { maxRetries: 1, baseDelayMs: 50 },
          cache: { ttlMs: 10000 },
        });
        break;

      case 'staging':
        config = this.createProductionConfig();
        strategy = this.createFullStrategy(logger ?? this._createConsoleLogger(), {
          logging: { logPrefix: '[STAGING]' },
          retry: { maxRetries: 2, baseDelayMs: 100 },
          cache: { ttlMs: 30000 },
        });
        break;

      case 'production':
        config = this.createProductionConfig();
        strategy = this.createFullStrategy(logger ?? this._createConsoleLogger(), {
          logging: { logPrefix: '[PROD]' },
          metrics: { maxSamples: 5000 },
          retry: { maxRetries: 3, baseDelayMs: 200, maxDelayMs: 10000 },
          cache: { ttlMs: 60000, maxEntries: 5000 },
        });
        break;

      case 'test':
        config = this.createMinimalConfig();
        strategy = this.createDefaultStrategy();
        break;

      default:
        throw new Error(`Unknown profile: ${profile}`);
    }

    return {
      config,
      service: this.createServiceService(),
      discovery: this.createServiceDiscoveryService(),
      strategy,
      statistics: this.createServiceStatistics(),
    };
  }

  /**
   * Creates a simple console logger for development/testing.
   */
  private static _createConsoleLogger(): ILogger {
    return {
      info: (message: string, meta?: Record<string, unknown>) => console.log(`[INFO] ${message}`, meta ?? ''),
      warn: (message: string, meta?: Record<string, unknown>) => console.warn(`[WARN] ${message}`, meta ?? ''),
      error: (message: string, meta?: Record<string, unknown>) => console.error(`[ERROR] ${message}`, meta ?? ''),
      debug: (message: string, meta?: Record<string, unknown>) => console.debug(`[DEBUG] ${message}`, meta ?? ''),
    };
  }
}
