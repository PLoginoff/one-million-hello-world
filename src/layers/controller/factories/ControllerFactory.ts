/**
 * Controller Factory
 *
 * Factory for creating controller components, configurations, and strategies.
 * Supports profile-based creation for different environments.
 */

import { ControllerConfigBuilder } from '../configuration/builders/ControllerConfigBuilder';
import { DefaultConfigs, ControllerConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { ControllerProfiles, ProfileName } from '../configuration/ControllerProfiles';
import { ControllerEntity } from '../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../domain/value-objects/ControllerScopeValueObject';
import { ControllerService } from '../domain/services/ControllerService';
import { ControllerRegistryService } from '../domain/services/ControllerRegistryService';
import { ControllerStatistics } from '../statistics/ControllerStatistics';
import { SingletonStrategy } from '../strategies/strategy/SingletonStrategy';
import { TransientStrategy } from '../strategies/strategy/TransientStrategy';
import { RequestStrategy } from '../strategies/strategy/RequestStrategy';
import { IControllerStrategy } from '../strategies/IControllerStrategy';
import { IControllerStrategy as ILifecycleStrategy } from '../strategies/strategy/IControllerStrategy';
import { DefaultControllerStrategy } from '../strategies/DefaultControllerStrategy';
import { LoggingControllerStrategy, ILogger } from '../strategies/LoggingControllerStrategy';
import { MetricsControllerStrategy } from '../strategies/MetricsControllerStrategy';

export class ControllerFactory {
  /**
   * Create default controller configuration
   */
  static createDefaultConfig(): ControllerConfigOptions {
    return ControllerConfigBuilder.create().build();
  }

  /**
   * Create development controller configuration
   */
  static createDevelopmentConfig(): ControllerConfigOptions {
    return ControllerConfigBuilder.development().build();
  }

  /**
   * Create production controller configuration
   */
  static createProductionConfig(): ControllerConfigOptions {
    return ControllerConfigBuilder.production().build();
  }

  /**
   * Create minimal controller configuration
   */
  static createMinimalConfig(): ControllerConfigOptions {
    return ControllerConfigBuilder.minimal().build();
  }

  /**
   * Create custom controller configuration
   */
  static createCustomConfig(options: Partial<ControllerConfigOptions>): ControllerConfigOptions {
    return ControllerConfigBuilder.create()
      .withAutoRegistration(options.enableAutoRegistration ?? DefaultConfigs.DEFAULT.enableAutoRegistration)
      .withDependencyInjection(options.enableDependencyInjection ?? DefaultConfigs.DEFAULT.enableDependencyInjection)
      .withDefaultScope(options.defaultScope ?? DefaultConfigs.DEFAULT.defaultScope)
      .withMaxControllers(options.maxControllers ?? DefaultConfigs.DEFAULT.maxControllers)
      .withMiddleware(options.enableMiddleware ?? DefaultConfigs.DEFAULT.enableMiddleware)
      .build();
  }

  /**
   * Create controller service
   */
  static createControllerService(): ControllerService {
    return new ControllerService();
  }

  /**
   * Create controller registry service
   */
  static createControllerRegistryService(): ControllerRegistryService {
    return new ControllerRegistryService();
  }

  /**
   * Create singleton strategy
   */
  static createSingletonStrategy(): ILifecycleStrategy {
    return new SingletonStrategy();
  }

  /**
   * Create transient strategy
   */
  static createTransientStrategy(): ILifecycleStrategy {
    return new TransientStrategy();
  }

  /**
   * Create request strategy
   */
  static createRequestStrategy(): ILifecycleStrategy {
    return new RequestStrategy();
  }

  /**
   * Create controller statistics
   */
  static createControllerStatistics(): ControllerStatistics {
    return new ControllerStatistics();
  }

  /**
   * Create controller entity
   */
  static createController(id: string, name: string, basePath: string): ControllerEntity {
    return ControllerEntity.createBasic(id, name, basePath);
  }

  /**
   * Create singleton scope
   */
  static createSingletonScope(): ControllerScopeValueObject {
    return ControllerScopeValueObject.singleton();
  }

  /**
   * Create transient scope
   */
  static createTransientScope(): ControllerScopeValueObject {
    return ControllerScopeValueObject.transient();
  }

  /**
   * Create request scope
   */
  static createRequestScope(): ControllerScopeValueObject {
    return ControllerScopeValueObject.request();
  }

  /**
   * Create complete controller stack with default configuration
   */
  static createDefaultStack(): {
    config: ControllerConfigOptions;
    service: ControllerService;
    registry: ControllerRegistryService;
    strategy: ILifecycleStrategy;
    statistics: ControllerStatistics;
  } {
    return {
      config: this.createDefaultConfig(),
      service: this.createControllerService(),
      registry: this.createControllerRegistryService(),
      strategy: this.createTransientStrategy(),
      statistics: this.createControllerStatistics(),
    };
  }

  /**
   * Create development controller stack
   */
  static createDevelopmentStack(): {
    config: ControllerConfigOptions;
    service: ControllerService;
    registry: ControllerRegistryService;
    strategy: ILifecycleStrategy;
    statistics: ControllerStatistics;
  } {
    return {
      config: this.createDevelopmentConfig(),
      service: this.createControllerService(),
      registry: this.createControllerRegistryService(),
      strategy: this.createTransientStrategy(),
      statistics: this.createControllerStatistics(),
    };
  }

  /**
   * Create production controller stack
   */
  static createProductionStack(): {
    config: ControllerConfigOptions;
    service: ControllerService;
    registry: ControllerRegistryService;
    strategy: ILifecycleStrategy;
    statistics: ControllerStatistics;
  } {
    return {
      config: this.createProductionConfig(),
      service: this.createControllerService(),
      registry: this.createControllerRegistryService(),
      strategy: this.createSingletonStrategy(),
      statistics: this.createControllerStatistics(),
    };
  }

  /**
   * Create a default controller strategy (base implementation)
   */
  static createDefaultStrategy(): DefaultControllerStrategy {
    return new DefaultControllerStrategy();
  }

  /**
   * Create a logged controller strategy
   */
  static createLoggedStrategy(
    inner: IControllerStrategy,
    logger: ILogger,
    logPrefix?: string
  ): LoggingControllerStrategy {
    return new LoggingControllerStrategy(inner, logger, logPrefix);
  }

  /**
   * Create a metrics controller strategy
   */
  static createMetricsStrategy(inner: IControllerStrategy, maxSamples?: number): MetricsControllerStrategy {
    return new MetricsControllerStrategy(inner, maxSamples);
  }

  /**
   * Create a logged and metrics controller strategy
   */
  static createLoggedAndMetricsStrategy(
    inner: IControllerStrategy,
    logger: ILogger,
    logPrefix?: string,
    maxSamples?: number
  ): MetricsControllerStrategy {
    const logged = this.createLoggedStrategy(inner, logger, logPrefix);
    return this.createMetricsStrategy(logged, maxSamples);
  }

  /**
   * Create controller configuration for a specific profile
   */
  static createConfigForProfile(profile: ProfileName): ControllerConfigOptions {
    return ControllerProfiles.getProfile(profile);
  }

  /**
   * Create complete controller stack for a specific profile
   */
  static createStackForProfile(profile: ProfileName): {
    config: ControllerConfigOptions;
    service: ControllerService;
    registry: ControllerRegistryService;
    strategy: ILifecycleStrategy;
    statistics: ControllerStatistics;
  } {
    const profileConfig = ControllerProfiles.getProfile(profile);

    let strategy: ILifecycleStrategy;
    switch (profile) {
      case 'development':
        strategy = this.createTransientStrategy();
        break;
      case 'staging':
        strategy = this.createTransientStrategy();
        break;
      case 'production':
        strategy = this.createSingletonStrategy();
        break;
      case 'test':
        strategy = this.createTransientStrategy();
        break;
      default:
        strategy = this.createTransientStrategy();
    }

    return {
      config: profileConfig,
      service: this.createControllerService(),
      registry: this.createControllerRegistryService(),
      strategy,
      statistics: this.createControllerStatistics(),
    };
  }

  /**
   * Create a fully configured controller with strategy for a profile
   */
  static createControllerWithStrategy(
    profile: ProfileName,
    logger?: ILogger
  ): {
    config: ControllerConfigOptions;
    controller: ControllerEntity;
    strategy: IControllerStrategy;
    statistics: ControllerStatistics;
  } {
    const stack = this.createStackForProfile(profile);

    // Convert lifecycle strategy to execution strategy
    let strategy: IControllerStrategy = new DefaultControllerStrategy();
    if (logger) {
      strategy = this.createLoggedAndMetricsStrategy(strategy, logger);
    }

    return {
      config: stack.config,
      controller: this.createController('default', 'DefaultController', '/'),
      strategy,
      statistics: stack.statistics,
    };
  }

  /**
   * Get available profiles
   */
  static getAvailableProfiles(): readonly ProfileName[] {
    return ControllerProfiles.getAvailableProfiles();
  }

  /**
   * Create a default console logger for development
   */
  static createConsoleLogger(): ILogger {
    return {
      info: (message: string, meta?: Record<string, unknown>) => console.log(`[INFO] ${message}`, meta ?? ''),
      warn: (message: string, meta?: Record<string, unknown>) => console.warn(`[WARN] ${message}`, meta ?? ''),
      error: (message: string, meta?: Record<string, unknown>) => console.error(`[ERROR] ${message}`, meta ?? ''),
      debug: (message: string, meta?: Record<string, unknown>) => console.debug(`[DEBUG] ${message}`, meta ?? ''),
    };
  }
}
