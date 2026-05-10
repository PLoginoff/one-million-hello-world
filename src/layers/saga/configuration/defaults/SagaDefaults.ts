/**
 * Saga Default Configurations
 *
 * Provides default configuration presets for different use cases.
 */

import { SagaConfig } from '../../domain/value-objects/SagaConfig';

export interface SagaConfigDefaults {
  sagaConfig: SagaConfig;
  enableMetrics: boolean;
  enableLogging: boolean;
  enableTracing: boolean;
}

export class SagaDefaults {
  /**
   * Default configuration for general use
   */
  static getDefault(name: string): SagaConfigDefaults {
    return {
      sagaConfig: SagaConfig.createDefault(name),
      enableMetrics: true,
      enableLogging: true,
      enableTracing: false,
    };
  }

  /**
   * High availability configuration
   */
  static getHighAvailability(name: string): SagaConfigDefaults {
    return {
      sagaConfig: SagaConfig.createHighAvailability(name),
      enableMetrics: true,
      enableLogging: true,
      enableTracing: true,
    };
  }

  /**
   * Development configuration
   */
  static getDevelopment(name: string): SagaConfigDefaults {
    return {
      sagaConfig: new SagaConfig({
        name,
        description: 'Development saga',
        timeout: 120000,
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'fixed',
          initialDelay: 0,
          maxDelay: 0,
          multiplier: 1,
        },
        compensationStrategy: 'manual',
        isolationLevel: 'read-committed',
        enableMetrics: true,
        enableLogging: true,
      }),
      enableMetrics: true,
      enableLogging: true,
      enableTracing: true,
    };
  }

  /**
   * Production configuration
   */
  static getProduction(name: string): SagaConfigDefaults {
    return {
      sagaConfig: SagaConfig.createHighAvailability(name),
      enableMetrics: true,
      enableLogging: true,
      enableTracing: true,
    };
  }

  /**
   * Fast configuration (low latency)
   */
  static getFast(name: string): SagaConfigDefaults {
    return {
      sagaConfig: new SagaConfig({
        name,
        description: 'Fast saga configuration',
        timeout: 5000,
        retryPolicy: {
          maxAttempts: 2,
          backoffStrategy: 'fixed',
          initialDelay: 100,
          maxDelay: 200,
          multiplier: 1,
        },
        compensationStrategy: 'automatic',
        isolationLevel: 'read-committed',
        enableMetrics: true,
        enableLogging: true,
      }),
      enableMetrics: true,
      enableLogging: true,
      enableTracing: false,
    };
  }
}
