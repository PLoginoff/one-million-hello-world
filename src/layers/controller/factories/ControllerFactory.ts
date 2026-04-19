/**
 * Controller Factory
 * 
 * Factory for creating controller components and configurations.
 */

import { ControllerConfigBuilder } from '../configuration/builders/ControllerConfigBuilder';
import { DefaultConfigs, ControllerConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { ControllerEntity } from '../domain/entities/ControllerEntity';
import { ControllerScopeValueObject } from '../domain/value-objects/ControllerScopeValueObject';
import { ControllerService } from '../domain/services/ControllerService';
import { ControllerRegistryService } from '../domain/services/ControllerRegistryService';
import { ControllerStatistics } from '../statistics/ControllerStatistics';
import { SingletonStrategy } from '../strategies/strategy/SingletonStrategy';
import { TransientStrategy } from '../strategies/strategy/TransientStrategy';
import { RequestStrategy } from '../strategies/strategy/RequestStrategy';
import { IControllerStrategy } from '../strategies/strategy/IControllerStrategy';

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
  static createSingletonStrategy(): SingletonStrategy {
    return new SingletonStrategy();
  }

  /**
   * Create transient strategy
   */
  static createTransientStrategy(): TransientStrategy {
    return new TransientStrategy();
  }

  /**
   * Create request strategy
   */
  static createRequestStrategy(): RequestStrategy {
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
    strategy: IControllerStrategy;
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
    strategy: IControllerStrategy;
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
    strategy: IControllerStrategy;
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
}
