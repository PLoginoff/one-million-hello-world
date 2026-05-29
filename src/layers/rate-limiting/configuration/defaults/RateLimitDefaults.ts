/**
 * Rate Limit Default Configurations
 *
 * Provides default configuration presets for different use cases.
 */

import { RateLimitConfig } from '../../domain/value-objects/RateLimitConfig';

export interface RateLimitConfigDefaults {
  rateLimitConfig: RateLimitConfig;
  enableMetrics: boolean;
  enableLogging: boolean;
}

export class RateLimitDefaults {
  /**
   * Default configuration for general use
   */
  static getDefault(limit: number): RateLimitConfigDefaults {
    return {
      rateLimitConfig: RateLimitConfig.createDefault(limit),
      enableMetrics: true,
      enableLogging: true,
    };
  }

  /**
   * Token bucket configuration
   */
  static getTokenBucket(limit: number, window: number, unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days'): RateLimitConfigDefaults {
    return {
      rateLimitConfig: RateLimitConfig.createTokenBucket(limit, window, unit),
      enableMetrics: true,
      enableLogging: true,
    };
  }

  /**
   * Sliding window configuration
   */
  static getSlidingWindow(limit: number, window: number, unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days'): RateLimitConfigDefaults {
    return {
      rateLimitConfig: RateLimitConfig.createSlidingWindow(limit, window, unit),
      enableMetrics: true,
      enableLogging: true,
    };
  }

  /**
   * Distributed configuration
   */
  static getDistributed(limit: number, window: number, unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days'): RateLimitConfigDefaults {
    return {
      rateLimitConfig: RateLimitConfig.createDistributed(limit, window, unit),
      enableMetrics: true,
      enableLogging: true,
    };
  }

  /**
   * Development configuration
   */
  static getDevelopment(): RateLimitConfigDefaults {
    return {
      rateLimitConfig: new RateLimitConfig({
        limit: 1000,
        window: 1,
        windowUnit: 'seconds',
        algorithm: 'token-bucket',
        distributed: false,
      }),
      enableMetrics: true,
      enableLogging: true,
    };
  }

  /**
   * Production configuration
   */
  static getProduction(limit: number): RateLimitConfigDefaults {
    return {
      rateLimitConfig: RateLimitConfig.createTokenBucket(limit, 1, 'seconds'),
      enableMetrics: true,
      enableLogging: true,
    };
  }
}
