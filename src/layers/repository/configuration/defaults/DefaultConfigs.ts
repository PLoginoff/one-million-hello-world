/**
 * Default Repository Configurations
 * 
 * Pre-configured settings for common repository scenarios.
 */

export interface RepositoryConfigOptions {
  enableAutoRegistration: boolean;
  enableConnectionPool: boolean;
  maxConnections: number;
  maxRepositories: number;
  enableCaching: boolean;
}

export class DefaultConfigs {
  /**
   * Default configuration for general use
   */
  static DEFAULT: RepositoryConfigOptions = {
    enableAutoRegistration: false,
    enableConnectionPool: true,
    maxConnections: 10,
    maxRepositories: 100,
    enableCaching: true,
  };

  /**
   * Development configuration
   */
  static DEVELOPMENT: RepositoryConfigOptions = {
    enableAutoRegistration: true,
    enableConnectionPool: true,
    maxConnections: 20,
    maxRepositories: 200,
    enableCaching: true,
  };

  /**
   * Production configuration
   */
  static PRODUCTION: RepositoryConfigOptions = {
    enableAutoRegistration: false,
    enableConnectionPool: true,
    maxConnections: 10,
    maxRepositories: 100,
    enableCaching: true,
  };

  /**
   * Minimal configuration
   */
  static MINIMAL: RepositoryConfigOptions = {
    enableAutoRegistration: false,
    enableConnectionPool: false,
    maxConnections: 5,
    maxRepositories: 50,
    enableCaching: false,
  };

  /**
   * Custom configuration builder
   */
  static custom(options: Partial<RepositoryConfigOptions>): RepositoryConfigOptions {
    return {
      ...DefaultConfigs.DEFAULT,
      ...options,
    } as RepositoryConfigOptions;
  }
}
