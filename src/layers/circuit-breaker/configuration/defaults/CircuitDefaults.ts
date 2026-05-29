/**
 * Circuit Breaker Default Configurations
 * 
 * Provides default configuration presets for different use cases.
 */

import { CircuitThreshold } from '../../domain/value-objects/CircuitThreshold';

export interface CircuitConfigDefaults {
  threshold: CircuitThreshold;
  enableMetrics: boolean;
  enableLogging: boolean;
  enableSlidingWindow: boolean;
  slidingWindowSize: number;
}

export class CircuitDefaults {
  /**
   * Default configuration for general use
   */
  static getDefault(): CircuitConfigDefaults {
    return {
      threshold: CircuitThreshold.createDefault(),
      enableMetrics: true,
      enableLogging: true,
      enableSlidingWindow: true,
      slidingWindowSize: 100,
    };
  }

  /**
   * Strict configuration for critical systems
   */
  static getStrict(): CircuitConfigDefaults {
    return {
      threshold: CircuitThreshold.createStrict(),
      enableMetrics: true,
      enableLogging: true,
      enableSlidingWindow: true,
      slidingWindowSize: 50,
    };
  }

  /**
   * Lenient configuration for non-critical systems
   */
  static getLenient(): CircuitConfigDefaults {
    return {
      threshold: CircuitThreshold.createLenient(),
      enableMetrics: false,
      enableLogging: false,
      enableSlidingWindow: false,
      slidingWindowSize: 200,
    };
  }

  /**
   * Development configuration
   */
  static getDevelopment(): CircuitConfigDefaults {
    return {
      threshold: new CircuitThreshold({
        failureThreshold: 10,
        successThreshold: 1,
        timeout: 30000,
        resetTimeout: 10000,
        slidingWindowSize: 50,
        minimumRequests: 5,
      }),
      enableMetrics: true,
      enableLogging: true,
      enableSlidingWindow: true,
      slidingWindowSize: 50,
    };
  }

  /**
   * Production configuration
   */
  static getProduction(): CircuitConfigDefaults {
    return {
      threshold: CircuitThreshold.createDefault(),
      enableMetrics: true,
      enableLogging: true,
      enableSlidingWindow: true,
      slidingWindowSize: 1000,
    };
  }

  /**
   * High-traffic configuration
   */
  static getHighTraffic(): CircuitConfigDefaults {
    return {
      threshold: new CircuitThreshold({
        failureThreshold: 100,
        successThreshold: 10,
        timeout: 60000,
        resetTimeout: 30000,
        slidingWindowSize: 10000,
        minimumRequests: 100,
      }),
      enableMetrics: true,
      enableLogging: true,
      enableSlidingWindow: true,
      slidingWindowSize: 10000,
    };
  }

  /**
   * Low-latency configuration
   */
  static getLowLatency(): CircuitConfigDefaults {
    return {
      threshold: new CircuitThreshold({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 10000,
        resetTimeout: 5000,
        slidingWindowSize: 20,
        minimumRequests: 3,
      }),
      enableMetrics: true,
      enableLogging: false,
      enableSlidingWindow: true,
      slidingWindowSize: 20,
    };
  }
}
