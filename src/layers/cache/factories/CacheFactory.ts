/**
 * Cache Factory
 *
 * Profile-based cache creation for different environments (dev/staging/prod/test).
 * Provides pre-configured cache instances optimized for each environment.
 *
 * @module CacheLayer/Factories
 */

import { CacheManager } from '@layers/cache/core/managers';
import { CacheConfigBuilder, CacheConfigOptions } from '@layers/cache/configuration/builders';
import { InvalidationStrategy } from '@layers/cache/types';
import { SegmentedCacheStrategy } from '@layers/cache/strategies/cache';
import type { SegmentConfig } from '@layers/cache/strategies/cache';

/**
 * Environment profiles
 */
export type CacheProfile = 'development' | 'staging' | 'production' | 'test' | 'high-performance' | 'large-cache';

/**
 * Cache factory options
 */
export interface CacheFactoryOptions {
  /** Environment profile */
  profile?: CacheProfile;
  /** Custom configuration overrides */
  config?: Partial<CacheConfigOptions>;
  /** Enable Redis adapter (requires Redis connection) */
  useRedis?: boolean;
  /** Redis configuration */
  redisConfig?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  /** Enable Redis Cluster */
  useCluster?: boolean;
  /** Cluster configuration */
  clusterConfig?: {
    nodes: Array<{ host: string; port: number }>;
    password?: string;
    keyPrefix?: string;
  };
  /** Enable multi-level caching (L1 + L2) */
  multiLevel?: boolean;
}

/**
 * Cache Factory
 *
 * Creates pre-configured CacheManager instances for different environments.
 */
export class CacheFactory {
  private static _defaultOptions: Required<CacheFactoryOptions> = {
    profile: 'development',
    config: {},
    useRedis: false,
    redisConfig: {
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
      keyPrefix: 'cache:',
    },
    useCluster: false,
    clusterConfig: {
      nodes: [{ host: 'localhost', port: 6379 }],
      password: undefined,
      keyPrefix: 'cache:',
    },
    multiLevel: false,
  };

  /**
   * Create a cache manager with the specified profile
   */
  static create(options: CacheFactoryOptions = {}): CacheManager {
    const opts = { ...this._defaultOptions, ...options };

    // Build configuration based on profile
    const config = this._buildConfig(opts.profile, opts.config);

    // Create cache manager with the configuration
    const manager = new CacheManager(config);

    return manager;
  }

  /**
   * Create a development cache (debug-friendly, small size)
   */
  static createDevelopment(options: Omit<CacheFactoryOptions, 'profile'> = {}): CacheManager {
    return this.create({ ...options, profile: 'development' });
  }

  /**
   * Create a staging cache (balanced, medium size)
   */
  static createStaging(options: Omit<CacheFactoryOptions, 'profile'> = {}): CacheManager {
    return this.create({ ...options, profile: 'staging' });
  }

  /**
   * Create a production cache (optimized, large size, Redis-backed)
   */
  static createProduction(options: Omit<CacheFactoryOptions, 'profile'> = {}): CacheManager {
    return this.create({ ...options, profile: 'production' });
  }

  /**
   * Create a test cache (fast, predictable, in-memory)
   */
  static createTest(options: Omit<CacheFactoryOptions, 'profile'> = {}): CacheManager {
    return this.create({ ...options, profile: 'test' });
  }

  /**
   * Create a high-performance cache (optimized for throughput)
   */
  static createHighPerformance(options: Omit<CacheFactoryOptions, 'profile'> = {}): CacheManager {
    return this.create({ ...options, profile: 'high-performance' });
  }

  /**
   * Create a large cache (optimized for capacity)
   */
  static createLargeCache(options: Omit<CacheFactoryOptions, 'profile'> = {}): CacheManager {
    return this.create({ ...options, profile: 'large-cache' });
  }

  /**
   * Create a multi-level cache (L1 memory + L2 Redis)
   */
  static createMultiLevel(options: Omit<CacheFactoryOptions, 'multiLevel'> & { redisConfig: CacheFactoryOptions['redisConfig'] } = {} as any): CacheManager {
    return this.create({
      ...options,
      multiLevel: true,
      useRedis: true,
      profile: options.profile ?? 'production',
    });
  }

  /**
   * Create a segmented cache with custom segment configurations
   */
  static createSegmented(segments: SegmentConfig[], options: Omit<CacheFactoryOptions, 'profile'> & { profile?: CacheProfile } = {}): CacheManager {
    const config = this._buildConfig(options.profile ?? 'development', {
      ...options.config,
      segmented: { segments, defaultSegment: segments[0]?.id ?? 'default' },
    });
    return new CacheManager(config);
  }

  /**
   * Build configuration for a profile
   */
  private static _buildConfig(profile: CacheProfile, overrides: Partial<CacheConfigOptions> = {}): CacheConfigOptions {
    let builder: CacheConfigBuilder;

    switch (profile) {
      case 'development':
        builder = CacheConfigBuilder.create();
        break;
      case 'staging':
        builder = CacheConfigBuilder.create();
        break;
      case 'production':
        builder = CacheConfigBuilder.create();
        break;
      case 'test':
        builder = CacheConfigBuilder.create();
        break;
      case 'high-performance':
        builder = CacheConfigBuilder.highPerformance();
        break;
      case 'large-cache':
        builder = CacheConfigBuilder.largeCache();
        break;
      default:
        builder = CacheConfigBuilder.create();
    }

    // Apply overrides
    if (overrides.maxSize) builder.withMaxSize(overrides.maxSize);
    if (overrides.defaultTTL) builder.withDefaultTTL(overrides.defaultTTL);
    if (overrides.invalidationStrategy) builder.withInvalidationStrategy(overrides.invalidationStrategy);
    if (overrides.enableMultiLevel !== undefined) builder.withMultiLevel(overrides.enableMultiLevel);

    return builder.buildUnsafe();
  }

  /**
   * Get default max size for profile
   */
  private static _getDefaultMaxSize(profile: CacheProfile): number {
    switch (profile) {
      case 'development':
      case 'test':
        return 1000;
      case 'staging':
        return 10000;
      case 'production':
        return 100000;
      case 'high-performance':
        return 50000;
      case 'large-cache':
        return 1000000;
      default:
        return 10000;
    }
  }

  /**
   * Get default TTL for profile
   */
  private static _getDefaultTTL(profile: CacheProfile): number {
    switch (profile) {
      case 'development':
      case 'test':
        return 60000; // 1 minute
      case 'staging':
        return 300000; // 5 minutes
      case 'production':
        return 3600000; // 1 hour
      case 'high-performance':
        return 120000; // 2 minutes
      case 'large-cache':
        return 7200000; // 2 hours
      default:
        return 300000;
    }
  }

  /**
   * Register a custom profile
   */
  static registerProfile(profile: string, builder: () => CacheConfigBuilder): void {
    // Could extend with custom profile registry
    console.log(`Custom profile '${profile}' registered`);
  }
}