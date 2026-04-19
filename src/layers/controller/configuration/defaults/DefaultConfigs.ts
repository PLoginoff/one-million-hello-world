/**
 * Default Controller Configurations
 * 
 * Pre-configured settings for common controller scenarios.
 */

export interface ControllerConfigOptions {
  enableAutoRegistration: boolean;
  enableDependencyInjection: boolean;
  defaultScope: 'singleton' | 'transient' | 'request';
  maxControllers: number;
  enableMiddleware: boolean;
}

export class DefaultConfigs {
  /**
   * Default configuration for general use
   */
  static DEFAULT: ControllerConfigOptions = {
    enableAutoRegistration: false,
    enableDependencyInjection: true,
    defaultScope: 'transient',
    maxControllers: 100,
    enableMiddleware: true,
  };

  /**
   * Development configuration
   */
  static DEVELOPMENT: ControllerConfigOptions = {
    enableAutoRegistration: true,
    enableDependencyInjection: true,
    defaultScope: 'transient',
    maxControllers: 200,
    enableMiddleware: true,
  };

  /**
   * Production configuration
   */
  static PRODUCTION: ControllerConfigOptions = {
    enableAutoRegistration: false,
    enableDependencyInjection: true,
    defaultScope: 'singleton',
    maxControllers: 100,
    enableMiddleware: true,
  };

  /**
   * Minimal configuration
   */
  static MINIMAL: ControllerConfigOptions = {
    enableAutoRegistration: false,
    enableDependencyInjection: false,
    defaultScope: 'transient',
    maxControllers: 50,
    enableMiddleware: false,
  };

  /**
   * Custom configuration builder
   */
  static custom(options: Partial<ControllerConfigOptions>): ControllerConfigOptions {
    return {
      ...DefaultConfigs.DEFAULT,
      ...options,
    } as ControllerConfigOptions;
  }
}
