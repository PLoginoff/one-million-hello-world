/**
 * Repository Configuration Builder
 * 
 * Fluent builder for creating repository configurations.
 */

import { RepositoryConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { RepositoryConfigValidator } from '../validators/RepositoryConfigValidator';

export class RepositoryConfigBuilder {
  private config: RepositoryConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): RepositoryConfigBuilder {
    return new RepositoryConfigBuilder();
  }

  /**
   * Start with development configuration
   */
  static development(): RepositoryConfigBuilder {
    const builder = new RepositoryConfigBuilder();
    builder.config = { ...DefaultConfigs.DEVELOPMENT };
    return builder;
  }

  /**
   * Start with production configuration
   */
  static production(): RepositoryConfigBuilder {
    const builder = new RepositoryConfigBuilder();
    builder.config = { ...DefaultConfigs.PRODUCTION };
    return builder;
  }

  /**
   * Start with minimal configuration
   */
  static minimal(): RepositoryConfigBuilder {
    const builder = new RepositoryConfigBuilder();
    builder.config = { ...DefaultConfigs.MINIMAL };
    return builder;
  }

  /**
   * Enable or disable auto registration
   */
  withAutoRegistration(enabled: boolean): RepositoryConfigBuilder {
    RepositoryConfigValidator.validateBooleanOption(enabled, 'enableAutoRegistration');
    this.config.enableAutoRegistration = enabled;
    return this;
  }

  /**
   * Enable or disable connection pool
   */
  withConnectionPool(enabled: boolean): RepositoryConfigBuilder {
    RepositoryConfigValidator.validateBooleanOption(enabled, 'enableConnectionPool');
    this.config.enableConnectionPool = enabled;
    return this;
  }

  /**
   * Set max connections
   */
  withMaxConnections(maxConnections: number): RepositoryConfigBuilder {
    RepositoryConfigValidator.validateMaxConnections(maxConnections);
    this.config.maxConnections = maxConnections;
    return this;
  }

  /**
   * Set max repositories
   */
  withMaxRepositories(maxRepositories: number): RepositoryConfigBuilder {
    RepositoryConfigValidator.validateMaxRepositories(maxRepositories);
    this.config.maxRepositories = maxRepositories;
    return this;
  }

  /**
   * Enable or disable caching
   */
  withCaching(enabled: boolean): RepositoryConfigBuilder {
    RepositoryConfigValidator.validateBooleanOption(enabled, 'enableCaching');
    this.config.enableCaching = enabled;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): RepositoryConfigOptions {
    RepositoryConfigValidator.validate(this.config);
    return { ...this.config };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): RepositoryConfigOptions {
    return { ...this.config };
  }
}
