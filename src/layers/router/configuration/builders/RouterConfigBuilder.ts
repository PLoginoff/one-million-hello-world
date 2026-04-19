/**
 * Router Configuration Builder
 * 
 * Fluent builder for creating router configurations.
 */

import { RouterConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { RouterConfigValidator } from '../validators/RouterConfigValidator';

export class RouterConfigBuilder {
  private config: RouterConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): RouterConfigBuilder {
    return new RouterConfigBuilder();
  }

  /**
   * Start with development configuration
   */
  static development(): RouterConfigBuilder {
    const builder = new RouterConfigBuilder();
    builder.config = { ...DefaultConfigs.DEVELOPMENT };
    return builder;
  }

  /**
   * Start with production configuration
   */
  static production(): RouterConfigBuilder {
    const builder = new RouterConfigBuilder();
    builder.config = { ...DefaultConfigs.PRODUCTION };
    return builder;
  }

  /**
   * Start with strict configuration
   */
  static strict(): RouterConfigBuilder {
    const builder = new RouterConfigBuilder();
    builder.config = { ...DefaultConfigs.STRICT };
    return builder;
  }

  /**
   * Enable or disable case sensitive routing
   */
  withCaseSensitive(enabled: boolean): RouterConfigBuilder {
    RouterConfigValidator.validateBooleanOption(enabled, 'enableCaseSensitive');
    this.config.enableCaseSensitive = enabled;
    return this;
  }

  /**
   * Enable or disable strict routing
   */
  withStrictRouting(enabled: boolean): RouterConfigBuilder {
    RouterConfigValidator.validateBooleanOption(enabled, 'enableStrictRouting');
    this.config.enableStrictRouting = enabled;
    return this;
  }

  /**
   * Enable or disable trailing slash
   */
  withTrailingSlash(enabled: boolean): RouterConfigBuilder {
    RouterConfigValidator.validateBooleanOption(enabled, 'enableTrailingSlash');
    this.config.enableTrailingSlash = enabled;
    return this;
  }

  /**
   * Set default priority
   */
  withDefaultPriority(priority: number): RouterConfigBuilder {
    if (typeof priority !== 'number' || isNaN(priority)) {
      throw new Error('defaultPriority must be a number');
    }
    this.config.defaultPriority = priority;
    return this;
  }

  /**
   * Set max routes
   */
  withMaxRoutes(maxRoutes: number): RouterConfigBuilder {
    RouterConfigValidator.validateMaxRoutes(maxRoutes);
    this.config.maxRoutes = maxRoutes;
    return this;
  }

  /**
   * Enable or disable auto registration
   */
  withAutoRegistration(enabled: boolean): RouterConfigBuilder {
    RouterConfigValidator.validateBooleanOption(enabled, 'enableAutoRegistration');
    this.config.enableAutoRegistration = enabled;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): RouterConfigOptions {
    RouterConfigValidator.validate(this.config);
    return { ...this.config };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): RouterConfigOptions {
    return { ...this.config };
  }
}
