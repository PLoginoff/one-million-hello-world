/**
 * Service Factory
 * 
 * Factory for creating service components and configurations.
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
import { IServiceStrategy } from '../strategies/strategy/IServiceStrategy';

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
}
