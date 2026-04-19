/**
 * Default Service Configurations
 * 
 * Pre-configured settings for common service scenarios.
 */

export interface ServiceConfigOptions {
  enableAutoRegistration: boolean;
  enableHealthCheck: boolean;
  healthCheckInterval: number;
  maxServices: number;
  enableDiscovery: boolean;
}

export class DefaultConfigs {
  /**
   * Default configuration for general use
   */
  static DEFAULT: ServiceConfigOptions = {
    enableAutoRegistration: false,
    enableHealthCheck: true,
    healthCheckInterval: 30000,
    maxServices: 100,
    enableDiscovery: true,
  };

  /**
   * Development configuration
   */
  static DEVELOPMENT: ServiceConfigOptions = {
    enableAutoRegistration: true,
    enableHealthCheck: true,
    healthCheckInterval: 10000,
    maxServices: 200,
    enableDiscovery: true,
  };

  /**
   * Production configuration
   */
  static PRODUCTION: ServiceConfigOptions = {
    enableAutoRegistration: false,
    enableHealthCheck: true,
    healthCheckInterval: 30000,
    maxServices: 100,
    enableDiscovery: true,
  };

  /**
   * Minimal configuration
   */
  static MINIMAL: ServiceConfigOptions = {
    enableAutoRegistration: false,
    enableHealthCheck: false,
    healthCheckInterval: 60000,
    maxServices: 50,
    enableDiscovery: false,
  };

  /**
   * Custom configuration builder
   */
  static custom(options: Partial<ServiceConfigOptions>): ServiceConfigOptions {
    return {
      ...DefaultConfigs.DEFAULT,
      ...options,
    } as ServiceConfigOptions;
  }
}
