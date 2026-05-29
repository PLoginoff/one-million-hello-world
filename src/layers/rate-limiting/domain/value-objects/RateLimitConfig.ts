/**
 * Rate Limit Configuration Value Object
 *
 * Represents rate limit configuration.
 * Immutable value object for rate limit management.
 */

export interface RateLimitConfigData {
  limit: number;
  window: number;
  windowUnit: WindowUnit;
  algorithm: RateLimitAlgorithm;
  burstLimit?: number;
  distributed: boolean;
}

export type WindowUnit = 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days';
export type RateLimitAlgorithm = 'token-bucket' | 'leaky-bucket' | 'fixed-window' | 'sliding-window' | 'distributed';

export class RateLimitConfig {
  readonly data: RateLimitConfigData;

  constructor(data: RateLimitConfigData) {
    this._validateConfig(data);
    this.data = { ...data };
  }

  /**
   * Get limit
   */
  getLimit(): number {
    return this.data.limit;
  }

  /**
   * Get window
   */
  getWindow(): number {
    return this.data.window;
  }

  /**
   * Get window unit
   */
  getWindowUnit(): WindowUnit {
    return this.data.windowUnit;
  }

  /**
   * Get algorithm
   */
  getAlgorithm(): RateLimitAlgorithm {
    return this.data.algorithm;
  }

  /**
   * Get burst limit
   */
  getBurstLimit(): number {
    return this.data.burstLimit || this.data.limit;
  }

  /**
   * Check if distributed
   */
  isDistributed(): boolean {
    return this.data.distributed;
  }

  /**
   * Get window in milliseconds
   */
  getWindowInMilliseconds(): number {
    const multiplier = {
      milliseconds: 1,
      seconds: 1000,
      minutes: 60000,
      hours: 3600000,
      days: 86400000,
    };

    return this.data.window * multiplier[this.data.windowUnit];
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<RateLimitConfigData>): RateLimitConfig {
    return new RateLimitConfig({ ...this.data, ...updates });
  }

  /**
   * Create default configuration
   */
  static createDefault(limit: number): RateLimitConfig {
    return new RateLimitConfig({
      limit,
      window: 1,
      windowUnit: 'seconds',
      algorithm: 'token-bucket',
      distributed: false,
    });
  }

  /**
   * Create token bucket configuration
   */
  static createTokenBucket(limit: number, window: number, unit: WindowUnit): RateLimitConfig {
    return new RateLimitConfig({
      limit,
      window,
      windowUnit: unit,
      algorithm: 'token-bucket',
      distributed: false,
    });
  }

  /**
   * Create sliding window configuration
   */
  static createSlidingWindow(limit: number, window: number, unit: WindowUnit): RateLimitConfig {
    return new RateLimitConfig({
      limit,
      window,
      windowUnit: unit,
      algorithm: 'sliding-window',
      distributed: false,
    });
  }

  /**
   * Create distributed configuration
   */
  static createDistributed(limit: number, window: number, unit: WindowUnit): RateLimitConfig {
    return new RateLimitConfig({
      limit,
      window,
      windowUnit: unit,
      algorithm: 'distributed',
      distributed: true,
    });
  }

  private _validateConfig(data: RateLimitConfigData): void {
    if (data.limit < 1) {
      throw new Error('Limit must be at least 1');
    }

    if (data.window < 1) {
      throw new Error('Window must be at least 1');
    }

    if (data.burstLimit !== undefined && data.burstLimit < data.limit) {
      throw new Error('Burst limit must be greater than or equal to limit');
    }
  }
}
