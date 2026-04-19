/**
 * Rate Limit Configuration Builder
 * 
 * Fluent builder for creating rate limiting configurations.
 */

import { RateLimitConfigOptions, DefaultConfigs } from '../defaults/DefaultConfigs';
import { RateLimitConfigValidator } from '../validators/RateLimitConfigValidator';

export class RateLimitConfigBuilder {
  private config: RateLimitConfigOptions;

  constructor() {
    this.config = { ...DefaultConfigs.DEFAULT };
  }

  /**
   * Start with default configuration
   */
  static create(): RateLimitConfigBuilder {
    return new RateLimitConfigBuilder();
  }

  /**
   * Start with strict configuration
   */
  static strict(): RateLimitConfigBuilder {
    const builder = new RateLimitConfigBuilder();
    builder.config = { ...DefaultConfigs.STRICT };
    return builder;
  }

  /**
   * Start with lenient configuration
   */
  static lenient(): RateLimitConfigBuilder {
    const builder = new RateLimitConfigBuilder();
    builder.config = { ...DefaultConfigs.LENIENT };
    return builder;
  }

  /**
   * Start with API configuration
   */
  static api(): RateLimitConfigBuilder {
    const builder = new RateLimitConfigBuilder();
    builder.config = { ...DefaultConfigs.API };
    return builder;
  }

  /**
   * Start with public API configuration
   */
  static publicApi(): RateLimitConfigBuilder {
    const builder = new RateLimitConfigBuilder();
    builder.config = { ...DefaultConfigs.PUBLIC_API };
    return builder;
  }

  /**
   * Set default limit
   */
  withDefaultLimit(limit: number): RateLimitConfigBuilder {
    RateLimitConfigValidator.validateDefaultLimit(limit);
    this.config.defaultLimit = limit;
    return this;
  }

  /**
   * Set default window in milliseconds
   */
  withDefaultWindow(window: number): RateLimitConfigBuilder {
    RateLimitConfigValidator.validateDefaultWindow(window);
    this.config.defaultWindow = window;
    return this;
  }

  /**
   * Enable or disable burst limiting
   */
  withBurstLimiting(enabled: boolean): RateLimitConfigBuilder {
    RateLimitConfigValidator.validateBooleanOption(enabled, 'enableBurstLimiting');
    this.config.enableBurstLimiting = enabled;
    return this;
  }

  /**
   * Set burst limit
   */
  withBurstLimit(limit: number): RateLimitConfigBuilder {
    RateLimitConfigValidator.validateBurstLimit(limit);
    this.config.burstLimit = limit;
    return this;
  }

  /**
   * Enable or disable IP-based limiting
   */
  withIpBasedLimiting(enabled: boolean): RateLimitConfigBuilder {
    RateLimitConfigValidator.validateBooleanOption(enabled, 'enableIpBasedLimiting');
    this.config.enableIpBasedLimiting = enabled;
    return this;
  }

  /**
   * Enable or disable user-based limiting
   */
  withUserBasedLimiting(enabled: boolean): RateLimitConfigBuilder {
    RateLimitConfigValidator.validateBooleanOption(enabled, 'enableUserBasedLimiting');
    this.config.enableUserBasedLimiting = enabled;
    return this;
  }

  /**
   * Enable or disable API key-based limiting
   */
  withApiKeyBasedLimiting(enabled: boolean): RateLimitConfigBuilder {
    RateLimitConfigValidator.validateBooleanOption(enabled, 'enableApiKeyBasedLimiting');
    this.config.enableApiKeyBasedLimiting = enabled;
    return this;
  }

  /**
   * Set cleanup interval in milliseconds
   */
  withCleanupInterval(interval: number): RateLimitConfigBuilder {
    RateLimitConfigValidator.validateCleanupInterval(interval);
    this.config.cleanupInterval = interval;
    return this;
  }

  /**
   * Set max keys in memory
   */
  withMaxKeysInMemory(maxKeys: number): RateLimitConfigBuilder {
    RateLimitConfigValidator.validateMaxKeysInMemory(maxKeys);
    this.config.maxKeysInMemory = maxKeys;
    return this;
  }

  /**
   * Build the configuration
   */
  build(): RateLimitConfigOptions {
    RateLimitConfigValidator.validate(this.config);
    return { ...this.config };
  }

  /**
   * Build without validation (use with caution)
   */
  buildUnsafe(): RateLimitConfigOptions {
    return { ...this.config };
  }
}
