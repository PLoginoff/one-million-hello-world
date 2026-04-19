/**
 * Default Rate Limiting Configurations
 * 
 * Pre-configured settings for common rate limiting scenarios.
 */

export interface RateLimitConfigOptions {
  defaultLimit: number;
  defaultWindow: number;
  enableBurstLimiting: boolean;
  burstLimit: number;
  enableIpBasedLimiting: boolean;
  enableUserBasedLimiting: boolean;
  enableApiKeyBasedLimiting: boolean;
  cleanupInterval: number;
  maxKeysInMemory: number;
}

export class DefaultConfigs {
  /**
   * Default configuration for general use
   */
  static DEFAULT: RateLimitConfigOptions = {
    defaultLimit: 100,
    defaultWindow: 60000,
    enableBurstLimiting: false,
    burstLimit: 10,
    enableIpBasedLimiting: true,
    enableUserBasedLimiting: true,
    enableApiKeyBasedLimiting: true,
    cleanupInterval: 300000,
    maxKeysInMemory: 10000,
  };

  /**
   * Strict configuration for high-security scenarios
   */
  static STRICT: RateLimitConfigOptions = {
    defaultLimit: 10,
    defaultWindow: 60000,
    enableBurstLimiting: true,
    burstLimit: 2,
    enableIpBasedLimiting: true,
    enableUserBasedLimiting: true,
    enableApiKeyBasedLimiting: true,
    cleanupInterval: 60000,
    maxKeysInMemory: 1000,
  };

  /**
   * Lenient configuration for development
   */
  static LENIENT: RateLimitConfigOptions = {
    defaultLimit: 1000,
    defaultWindow: 60000,
    enableBurstLimiting: false,
    burstLimit: 50,
    enableIpBasedLimiting: false,
    enableUserBasedLimiting: false,
    enableApiKeyBasedLimiting: false,
    cleanupInterval: 600000,
    maxKeysInMemory: 100000,
  };

  /**
   * API-specific configuration
   */
  static API: RateLimitConfigOptions = {
    defaultLimit: 1000,
    defaultWindow: 3600000,
    enableBurstLimiting: true,
    burstLimit: 100,
    enableIpBasedLimiting: true,
    enableUserBasedLimiting: true,
    enableApiKeyBasedLimiting: true,
    cleanupInterval: 300000,
    maxKeysInMemory: 50000,
  };

  /**
   * Public API configuration
   */
  static PUBLIC_API: RateLimitConfigOptions = {
    defaultLimit: 100,
    defaultWindow: 60000,
    enableBurstLimiting: true,
    burstLimit: 10,
    enableIpBasedLimiting: true,
    enableUserBasedLimiting: false,
    enableApiKeyBasedLimiting: true,
    cleanupInterval: 300000,
    maxKeysInMemory: 10000,
  };

  /**
   * Custom configuration builder
   */
  static custom(options: Partial<RateLimitConfigOptions>): RateLimitConfigOptions {
    return {
      ...DefaultConfigs.DEFAULT,
      ...options,
    } as RateLimitConfigOptions;
  }
}
