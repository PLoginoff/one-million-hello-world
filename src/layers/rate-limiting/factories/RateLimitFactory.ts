/**
 * Rate Limit Factory
 * 
 * Factory for creating rate limiting components and configurations.
 */

import { RateLimitConfigBuilder } from '../configuration/builders/RateLimitConfigBuilder';
import { DefaultConfigs, RateLimitConfigOptions } from '../configuration/defaults/DefaultConfigs';
import { RateLimitEntity } from '../domain/entities/RateLimitEntity';
import { RateLimitKey } from '../domain/entities/RateLimitKey';
import { RateLimitWindowValueObject } from '../domain/value-objects/RateLimitWindowValueObject';
import { RateLimitingService } from '../domain/services/RateLimitingService';
import { RateLimitStatistics } from '../statistics/RateLimitStatistics';
import { FixedWindowStrategy } from '../strategies/algorithm/FixedWindowStrategy';
import { SlidingWindowStrategy } from '../strategies/algorithm/SlidingWindowStrategy';
import { IRateLimitAlgorithm } from '../strategies/algorithm/IRateLimitAlgorithm';

export class RateLimitFactory {
  /**
   * Create default rate limit configuration
   */
  static createDefaultConfig(): RateLimitConfigOptions {
    return RateLimitConfigBuilder.create().build();
  }

  /**
   * Create strict rate limit configuration
   */
  static createStrictConfig(): RateLimitConfigOptions {
    return RateLimitConfigBuilder.strict().build();
  }

  /**
   * Create lenient rate limit configuration
   */
  static createLenientConfig(): RateLimitConfigOptions {
    return RateLimitConfigBuilder.lenient().build();
  }

  /**
   * Create API rate limit configuration
   */
  static createApiConfig(): RateLimitConfigOptions {
    return RateLimitConfigBuilder.api().build();
  }

  /**
   * Create public API rate limit configuration
   */
  static createPublicApiConfig(): RateLimitConfigOptions {
    return RateLimitConfigBuilder.publicApi().build();
  }

  /**
   * Create custom rate limit configuration
   */
  static createCustomConfig(options: Partial<RateLimitConfigOptions>): RateLimitConfigOptions {
    return RateLimitConfigBuilder.create()
      .withDefaultLimit(options.defaultLimit ?? DefaultConfigs.DEFAULT.defaultLimit)
      .withDefaultWindow(options.defaultWindow ?? DefaultConfigs.DEFAULT.defaultWindow)
      .withBurstLimiting(options.enableBurstLimiting ?? DefaultConfigs.DEFAULT.enableBurstLimiting)
      .withBurstLimit(options.burstLimit ?? DefaultConfigs.DEFAULT.burstLimit)
      .withIpBasedLimiting(options.enableIpBasedLimiting ?? DefaultConfigs.DEFAULT.enableIpBasedLimiting)
      .withUserBasedLimiting(options.enableUserBasedLimiting ?? DefaultConfigs.DEFAULT.enableUserBasedLimiting)
      .withApiKeyBasedLimiting(options.enableApiKeyBasedLimiting ?? DefaultConfigs.DEFAULT.enableApiKeyBasedLimiting)
      .withCleanupInterval(options.cleanupInterval ?? DefaultConfigs.DEFAULT.cleanupInterval)
      .withMaxKeysInMemory(options.maxKeysInMemory ?? DefaultConfigs.DEFAULT.maxKeysInMemory)
      .build();
  }

  /**
   * Create fixed window algorithm
   */
  static createFixedWindowStrategy(): FixedWindowStrategy {
    return new FixedWindowStrategy();
  }

  /**
   * Create sliding window algorithm
   */
  static createSlidingWindowStrategy(): SlidingWindowStrategy {
    return new SlidingWindowStrategy();
  }

  /**
   * Create rate limiting service
   */
  static createRateLimitingService(): RateLimitingService {
    return new RateLimitingService();
  }

  /**
   * Create rate limit statistics
   */
  static createRateLimitStatistics(): RateLimitStatistics {
    return new RateLimitStatistics();
  }

  /**
   * Create rate limit key from IP
   */
  static createIpKey(ip: string): RateLimitKey {
    return RateLimitKey.fromIp(ip);
  }

  /**
   * Create rate limit key from user ID
   */
  static createUserKey(userId: string): RateLimitKey {
    return RateLimitKey.fromUser(userId);
  }

  /**
   * Create rate limit key from API key
   */
  static createApiKey(apiKey: string): RateLimitKey {
    return RateLimitKey.fromApiKey(apiKey);
  }

  /**
   * Create composite rate limit key
   */
  static createCompositeKey(...parts: string[]): RateLimitKey {
    return RateLimitKey.composite(...parts);
  }

  /**
   * Create rate limit window
   */
  static createWindow(milliseconds: number): RateLimitWindowValueObject {
    return RateLimitWindowValueObject.fromMilliseconds(milliseconds);
  }

  /**
   * Create rate limit entity
   */
  static createRateLimitEntity(
    identifier: string,
    limit: number,
    window: number
  ): RateLimitEntity {
    return RateLimitEntity.createNew(identifier, limit, window);
  }

  /**
   * Create complete rate limiting stack with default configuration
   */
  static createDefaultStack(): {
    config: RateLimitConfigOptions;
    algorithm: IRateLimitAlgorithm;
    service: RateLimitingService;
    statistics: RateLimitStatistics;
  } {
    return {
      config: this.createDefaultConfig(),
      algorithm: this.createFixedWindowStrategy(),
      service: this.createRateLimitingService(),
      statistics: this.createRateLimitStatistics(),
    };
  }

  /**
   * Create strict rate limiting stack
   */
  static createStrictStack(): {
    config: RateLimitConfigOptions;
    algorithm: IRateLimitAlgorithm;
    service: RateLimitingService;
    statistics: RateLimitStatistics;
  } {
    return {
      config: this.createStrictConfig(),
      algorithm: this.createSlidingWindowStrategy(),
      service: this.createRateLimitingService(),
      statistics: this.createRateLimitStatistics(),
    };
  }

  /**
   * Create API rate limiting stack
   */
  static createApiStack(): {
    config: RateLimitConfigOptions;
    algorithm: IRateLimitAlgorithm;
    service: RateLimitingService;
    statistics: RateLimitStatistics;
  } {
    return {
      config: this.createApiConfig(),
      algorithm: this.createSlidingWindowStrategy(),
      service: this.createRateLimitingService(),
      statistics: this.createRateLimitStatistics(),
    };
  }
}
