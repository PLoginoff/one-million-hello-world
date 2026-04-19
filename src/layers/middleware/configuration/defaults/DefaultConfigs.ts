/**
 * Default Middleware Configurations
 * 
 * Pre-configured settings for common middleware scenarios.
 */

export interface MiddlewareConfigOptions {
  enableErrorHandling: boolean;
  enableLogging: boolean;
  enableMetrics: boolean;
  defaultPriority: number;
  enableParallelExecution: boolean;
  maxMiddlewareDepth: number;
  timeout: number;
}

export class DefaultConfigs {
  /**
   * Default configuration for general use
   */
  static DEFAULT: MiddlewareConfigOptions = {
    enableErrorHandling: true,
    enableLogging: true,
    enableMetrics: false,
    defaultPriority: 0,
    enableParallelExecution: false,
    maxMiddlewareDepth: 50,
    timeout: 30000,
  };

  /**
   * Development configuration
   */
  static DEVELOPMENT: MiddlewareConfigOptions = {
    enableErrorHandling: true,
    enableLogging: true,
    enableMetrics: true,
    defaultPriority: 0,
    enableParallelExecution: false,
    maxMiddlewareDepth: 100,
    timeout: 60000,
  };

  /**
   * Production configuration
   */
  static PRODUCTION: MiddlewareConfigOptions = {
    enableErrorHandling: true,
    enableLogging: false,
    enableMetrics: true,
    defaultPriority: 0,
    enableParallelExecution: false,
    maxMiddlewareDepth: 50,
    timeout: 30000,
  };

  /**
   * High-performance configuration
   */
  static HIGH_PERFORMANCE: MiddlewareConfigOptions = {
    enableErrorHandling: true,
    enableLogging: false,
    enableMetrics: false,
    defaultPriority: 0,
    enableParallelExecution: true,
    maxMiddlewareDepth: 30,
    timeout: 10000,
  };

  /**
   * Custom configuration builder
   */
  static custom(options: Partial<MiddlewareConfigOptions>): MiddlewareConfigOptions {
    return {
      ...DefaultConfigs.DEFAULT,
      ...options,
    } as MiddlewareConfigOptions;
  }
}
