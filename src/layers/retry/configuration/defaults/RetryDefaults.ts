/**
 * Retry Default Configurations
 *
 * Provides default configuration presets for different use cases.
 */

import { RetryPolicy } from '../../domain/value-objects/RetryPolicy';
import { RetryCondition } from '../../domain/value-objects/RetryCondition';

export interface RetryConfigDefaults {
  retryPolicy: RetryPolicy;
  retryCondition: RetryCondition;
  enableMetrics: boolean;
  enableLogging: boolean;
}

export class RetryDefaults {
  /**
   * Default configuration for general use
   */
  static getDefault(): RetryConfigDefaults {
    return {
      retryPolicy: RetryPolicy.createDefault(),
      retryCondition: RetryCondition.createDefault(),
      enableMetrics: true,
      enableLogging: true,
    };
  }

  /**
   * Network error configuration
   */
  static getNetworkError(): RetryConfigDefaults {
    return {
      retryPolicy: RetryPolicy.createDefault(),
      retryCondition: RetryCondition.createNetworkErrorCondition(),
      enableMetrics: true,
      enableLogging: true,
    };
  }

  /**
   * Aggressive retry configuration
   */
  static getAggressive(): RetryConfigDefaults {
    return {
      retryPolicy: RetryPolicy.createAggressive(),
      retryCondition: RetryCondition.createNetworkErrorCondition(),
      enableMetrics: true,
      enableLogging: true,
    };
  }

  /**
   * Immediate retry configuration
   */
  static getImmediate(): RetryConfigDefaults {
    return {
      retryPolicy: RetryPolicy.createImmediate(),
      retryCondition: RetryCondition.createDefault(),
      enableMetrics: true,
      enableLogging: true,
    };
  }

  /**
   * Development configuration
   */
  static getDevelopment(): RetryConfigDefaults {
    return {
      retryPolicy: new RetryPolicy({
        maxAttempts: 1,
        backoffStrategy: 'fixed',
        initialDelay: 0,
        maxDelay: 0,
        multiplier: 1,
        jitterEnabled: false,
        jitterFactor: 0,
      }),
      retryCondition: RetryCondition.createDefault(),
      enableMetrics: true,
      enableLogging: true,
    };
  }
}
