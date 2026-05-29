/**
 * Facade Default Configurations
 *
 * Provides default configuration presets for different use cases.
 */

import { FacadeConfig } from '../../domain/value-objects/FacadeConfig';

export interface FacadeConfigDefaults {
  facadeConfig: FacadeConfig;
  enableMetrics: boolean;
  enableLogging: boolean;
  enableTracing: boolean;
}

export class FacadeDefaults {
  /**
   * Default configuration for general use
   */
  static getDefault(name: string): FacadeConfigDefaults {
    return {
      facadeConfig: FacadeConfig.createDefault(name),
      enableMetrics: true,
      enableLogging: true,
      enableTracing: false,
    };
  }

  /**
   * High availability configuration
   */
  static getHighAvailability(name: string): FacadeConfigDefaults {
    return {
      facadeConfig: FacadeConfig.createHighAvailability(name),
      enableMetrics: true,
      enableLogging: true,
      enableTracing: true,
    };
  }

  /**
   * Development configuration
   */
  static getDevelopment(name: string): FacadeConfigDefaults {
    return {
      facadeConfig: new FacadeConfig({
        name,
        description: 'Development facade',
        enabled: true,
        timeout: 60000,
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'fixed',
          initialDelay: 1000,
          maxDelay: 1000,
          multiplier: 1,
        },
        fallbackEnabled: false,
        tags: ['development'],
      }),
      enableMetrics: true,
      enableLogging: true,
      enableTracing: true,
    };
  }

  /**
   * Production configuration
   */
  static getProduction(name: string): FacadeConfigDefaults {
    return {
      facadeConfig: FacadeConfig.createHighAvailability(name),
      enableMetrics: true,
      enableLogging: true,
      enableTracing: true,
    };
  }

  /**
   * Low latency configuration
   */
  static getLowLatency(name: string): FacadeConfigDefaults {
    return {
      facadeConfig: new FacadeConfig({
        name,
        description: 'Low latency facade',
        enabled: true,
        timeout: 5000,
        retryPolicy: {
          maxAttempts: 2,
          backoffStrategy: 'fixed',
          initialDelay: 100,
          maxDelay: 200,
          multiplier: 1,
        },
        fallbackEnabled: true,
        tags: ['low-latency'],
      }),
      enableMetrics: true,
      enableLogging: true,
      enableTracing: true,
    };
  }
}
