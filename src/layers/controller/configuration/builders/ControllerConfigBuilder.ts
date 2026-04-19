/**
 * Controller Configuration Builder
 * 
 * Fluent builder for creating controller configurations.
 */

import { ControllerConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { ControllerConfigValidator } from '../validators/ControllerConfigValidator';

export class ControllerConfigBuilder {
  private config: ControllerConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): ControllerConfigBuilder {
    return new ControllerConfigBuilder();
  }

  /**
   * Start with development configuration
   */
  static development(): ControllerConfigBuilder {
    const builder = new ControllerConfigBuilder();
    builder.config = { ...DefaultConfigs.DEVELOPMENT };
    return builder;
  }

  /**
   * Start with production configuration
   */
  static production(): ControllerConfigBuilder {
    const builder = new ControllerConfigBuilder();
    builder.config = { ...DefaultConfigs.PRODUCTION };
    return builder;
  }

  /**
   * Start with minimal configuration
   */
  static minimal(): ControllerConfigBuilder {
    const builder = new ControllerConfigBuilder();
    builder.config = { ...DefaultConfigs.MINIMAL };
    return builder;
  }

  /**
   * Enable or disable auto registration
   */
  withAutoRegistration(enabled: boolean): ControllerConfigBuilder {
    ControllerConfigValidator.validateBooleanOption(enabled, 'enableAutoRegistration');
    this.config.enableAutoRegistration = enabled;
    return this;
  }

  /**
   * Enable or disable dependency injection
   */
  withDependencyInjection(enabled: boolean): ControllerConfigBuilder {
    ControllerConfigValidator.validateBooleanOption(enabled, 'enableDependencyInjection');
    this.config.enableDependencyInjection = enabled;
    return this;
  }

  /**
   * Set default scope
   */
  withDefaultScope(scope: 'singleton' | 'transient' | 'request'): ControllerConfigBuilder {
    ControllerConfigValidator.validateDefaultScope(scope);
    this.config.defaultScope = scope;
    return this;
  }

  /**
   * Set max controllers
   */
  withMaxControllers(maxControllers: number): ControllerConfigBuilder {
    ControllerConfigValidator.validateMaxControllers(maxControllers);
    this.config.maxControllers = maxControllers;
    return this;
  }

  /**
   * Enable or disable middleware
   */
  withMiddleware(enabled: boolean): ControllerConfigBuilder {
    ControllerConfigValidator.validateBooleanOption(enabled, 'enableMiddleware');
    this.config.enableMiddleware = enabled;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): ControllerConfigOptions {
    ControllerConfigValidator.validate(this.config);
    return { ...this.config };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): ControllerConfigOptions {
    return { ...this.config };
  }
}
