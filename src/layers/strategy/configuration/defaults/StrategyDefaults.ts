/**
 * Strategy Default Configurations
 * 
 * Provides default configuration presets for different use cases.
 */

import { StrategyConfig as DomainStrategyConfig } from '../../domain/value-objects/StrategyConfig';

export interface StrategyConfigDefaults {
  strategyConfig: DomainStrategyConfig;
  enableMetrics: boolean;
  enableLogging: boolean;
  enableFeatureFlags: boolean;
}

export class StrategyDefaults {
  /**
   * Default configuration for general use
   */
  static getDefault(name: string): StrategyConfigDefaults {
    return {
      strategyConfig: DomainStrategyConfig.createDefault(name),
      enableMetrics: true,
      enableLogging: true,
      enableFeatureFlags: false,
    };
  }

  /**
   * High priority configuration
   */
  static getHighPriority(name: string): StrategyConfigDefaults {
    return {
      strategyConfig: DomainStrategyConfig.createHighPriority(name),
      enableMetrics: true,
      enableLogging: true,
      enableFeatureFlags: true,
    };
  }

  /**
   * Low priority configuration
   */
  static getLowPriority(name: string): StrategyConfigDefaults {
    return {
      strategyConfig: DomainStrategyConfig.createLowPriority(name),
      enableMetrics: false,
      enableLogging: false,
      enableFeatureFlags: false,
    };
  }

  /**
   * Development configuration
   */
  static getDevelopment(name: string): StrategyConfigDefaults {
    return {
      strategyConfig: new DomainStrategyConfig({
        name,
        description: 'Development strategy',
        enabled: true,
        priority: 0,
        timeout: 60000,
        retryPolicy: {
          maxAttempts: 1,
          backoffStrategy: 'fixed',
          initialDelay: 1000,
          maxDelay: 1000,
          multiplier: 1,
        },
        tags: ['development'],
      }),
      enableMetrics: true,
      enableLogging: true,
      enableFeatureFlags: true,
    };
  }

  /**
   * Production configuration
   */
  static getProduction(name: string): StrategyConfigDefaults {
    return {
      strategyConfig: DomainStrategyConfig.createHighPriority(name),
      enableMetrics: true,
      enableLogging: true,
      enableFeatureFlags: true,
    };
  }

  /**
   * A/B testing configuration
   */
  static getABTesting(name: string): StrategyConfigDefaults {
    return {
      strategyConfig: new DomainStrategyConfig({
        name,
        description: 'A/B testing strategy',
        enabled: true,
        priority: 50,
        timeout: 30000,
        retryPolicy: {
          maxAttempts: 3,
          backoffStrategy: 'exponential',
          initialDelay: 1000,
          maxDelay: 10000,
          multiplier: 2,
        },
        tags: ['ab-testing', 'experiment'],
      }),
      enableMetrics: true,
      enableLogging: true,
      enableFeatureFlags: true,
    };
  }
}
