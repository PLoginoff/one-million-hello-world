/**
 * Default Router Configurations
 * 
 * Pre-configured settings for common routing scenarios.
 */

export interface RouterConfigOptions {
  enableCaseSensitive: boolean;
  enableStrictRouting: boolean;
  enableTrailingSlash: boolean;
  defaultPriority: number;
  maxRoutes: number;
  enableAutoRegistration: boolean;
}

export class DefaultConfigs {
  /**
   * Default configuration for general use
   */
  static DEFAULT: RouterConfigOptions = {
    enableCaseSensitive: false,
    enableStrictRouting: false,
    enableTrailingSlash: false,
    defaultPriority: 0,
    maxRoutes: 1000,
    enableAutoRegistration: false,
  };

  /**
   * Development configuration
   */
  static DEVELOPMENT: RouterConfigOptions = {
    enableCaseSensitive: false,
    enableStrictRouting: false,
    enableTrailingSlash: true,
    defaultPriority: 0,
    maxRoutes: 2000,
    enableAutoRegistration: true,
  };

  /**
   * Production configuration
   */
  static PRODUCTION: RouterConfigOptions = {
    enableCaseSensitive: false,
    enableStrictRouting: true,
    enableTrailingSlash: false,
    defaultPriority: 0,
    maxRoutes: 1000,
    enableAutoRegistration: false,
  };

  /**
   * Strict configuration
   */
  static STRICT: RouterConfigOptions = {
    enableCaseSensitive: true,
    enableStrictRouting: true,
    enableTrailingSlash: false,
    defaultPriority: 0,
    maxRoutes: 500,
    enableAutoRegistration: false,
  };

  /**
   * Custom configuration builder
   */
  static custom(options: Partial<RouterConfigOptions>): RouterConfigOptions {
    return {
      ...DefaultConfigs.DEFAULT,
      ...options,
    } as RouterConfigOptions;
  }
}
