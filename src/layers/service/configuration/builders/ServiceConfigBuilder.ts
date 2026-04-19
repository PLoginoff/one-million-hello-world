/**
 * Service Configuration Builder
 * 
 * Fluent builder for creating service configurations.
 */

import { ServiceConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { ServiceConfigValidator } from '../validators/ServiceConfigValidator';

export class ServiceConfigBuilder {
  private config: ServiceConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): ServiceConfigBuilder {
    return new ServiceConfigBuilder();
  }

  /**
   * Start with development configuration
   */
  static development(): ServiceConfigBuilder {
    const builder = new ServiceConfigBuilder();
    builder.config = { ...DefaultConfigs.DEVELOPMENT };
    return builder;
  }

  /**
   * Start with production configuration
   */
  static production(): ServiceConfigBuilder {
    const builder = new ServiceConfigBuilder();
    builder.config = { ...DefaultConfigs.PRODUCTION };
    return builder;
  }

  /**
   * Start with minimal configuration
   */
  static minimal(): ServiceConfigBuilder {
    const builder = new ServiceConfigBuilder();
    builder.config = { ...DefaultConfigs.MINIMAL };
    return builder;
  }

  /**
   * Enable or disable auto registration
   */
  withAutoRegistration(enabled: boolean): ServiceConfigBuilder {
    ServiceConfigValidator.validateBooleanOption(enabled, 'enableAutoRegistration');
    this.config.enableAutoRegistration = enabled;
    return this;
  }

  /**
   * Enable or disable health check
   */
  withHealthCheck(enabled: boolean): ServiceConfigBuilder {
    ServiceConfigValidator.validateBooleanOption(enabled, 'enableHealthCheck');
    this.config.enableHealthCheck = enabled;
    return this;
  }

  /**
   * Set health check interval
   */
  withHealthCheckInterval(interval: number): ServiceConfigBuilder {
    ServiceConfigValidator.validateHealthCheckInterval(interval);
    this.config.healthCheckInterval = interval;
    return this;
  }

  /**
   * Set max services
   */
  withMaxServices(maxServices: number): ServiceConfigBuilder {
    ServiceConfigValidator.validateMaxServices(maxServices);
    this.config.maxServices = maxServices;
    return this;
  }

  /**
   * Enable or disable discovery
   */
  withDiscovery(enabled: boolean): ServiceConfigBuilder {
    ServiceConfigValidator.validateBooleanOption(enabled, 'enableDiscovery');
    this.config.enableDiscovery = enabled;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): ServiceConfigOptions {
    ServiceConfigValidator.validate(this.config);
    return { ...this.config };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): ServiceConfigOptions {
    return { ...this.config };
  }
}
