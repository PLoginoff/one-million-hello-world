/**
 * Cache Factory
 *
 * Factory for creating cache strategies with various configurations.
 * Supports profile-based creation for different environments.
 *
 * @module CacheLayer/Factories
 */

import {
  ICacheStrategy,
  CacheStrategyConfig,
  LRUCacheStrategy,
  LFUCacheStrategy,
  TTLCacheStrategy,
  TwoTierCacheStrategy,
  TwoTierCacheConfig,
} from '../../strategies/cache';
import { CacheError, CacheErrorCode } from '../../errors';
import { IStorage } from '../../storage/interfaces/IStorage';

/**
 * Cache profile types
 */
export type CacheProfile = 'development' | 'staging' | 'production' | 'test';

/**
 * Profile-specific default configurations
 */
const PROFILE_CONFIGS: Record<CacheProfile, CacheStrategyConfig> = {
  development: {
    maxSize: 100,
    defaultTTL: 30000, // 30 seconds
    enableMetrics: true,
  },
  staging: {
    maxSize: 1000,
    defaultTTL: 60000, // 1 minute
    enableMetrics: true,
  },
  production: {
    maxSize: 10000,
    defaultTTL: 300000, // 5 minutes
    enableMetrics: true,
  },
  test: {
    maxSize: 50,
    defaultTTL: 5000, // 5 seconds
    enableMetrics: false,
  },
};

/**
 * Two-tier profile configurations
 */
const TWO_TIER_PROFILE_CONFIGS: Record<CacheProfile, TwoTierCacheConfig> = {
  development: {
    maxSize: 100,
    defaultTTL: 30000,
    enableMetrics: true,
    l1: { maxSize: 50, defaultTTL: 10000, enableMetrics: true },
    l2: { maxSize: 500, defaultTTL: 60000, enableMetrics: true },
    promoteOnL2Hit: true,
    writeThrough: true,
    writeBehind: false,
    l2Timeout: 50,
  },
  staging: {
    maxSize: 1000,
    defaultTTL: 60000,
    enableMetrics: true,
    l1: { maxSize: 200, defaultTTL: 30000, enableMetrics: true },
    l2: { maxSize: 5000, defaultTTL: 120000, enableMetrics: true },
    promoteOnL2Hit: true,
    writeThrough: true,
    writeBehind: false,
    l2Timeout: 100,
  },
  production: {
    maxSize: 10000,
    defaultTTL: 300000,
    enableMetrics: true,
    l1: { maxSize: 1000, defaultTTL: 60000, enableMetrics: true },
    l2: { maxSize: 50000, defaultTTL: 600000, enableMetrics: true },
    promoteOnL2Hit: true,
    writeThrough: false,
    writeBehind: true,
    l2Timeout: 200,
  },
  test: {
    maxSize: 50,
    defaultTTL: 5000,
    enableMetrics: false,
    l1: { maxSize: 20, defaultTTL: 2000, enableMetrics: false },
    l2: { maxSize: 100, defaultTTL: 10000, enableMetrics: false },
    promoteOnL2Hit: false,
    writeThrough: true,
    writeBehind: false,
    l2Timeout: 10,
  },
};

/**
 * Cache Factory Class
 *
 * Provides static methods for creating configured cache strategies.
 */
export class CacheFactory {
  private static _customProfiles: Map<string, CacheStrategyConfig> = new Map();
  private static _customTwoTierProfiles: Map<string, TwoTierCacheConfig> = new Map();

  /**
   * Create an LRU cache strategy
   *
   * @param capacity - Maximum number of entries
   * @param defaultTTL - Default TTL in milliseconds (optional)
   * @param config - Additional configuration options (optional)
   * @returns Configured LRU cache strategy
   */
  static createLRU(
    capacity: number,
    defaultTTL?: number,
    config?: Partial<CacheStrategyConfig>
  ): LRUCacheStrategy<unknown> {
    const strategy = new LRUCacheStrategy<unknown>();
    strategy.initialize({
      maxSize: capacity,
      defaultTTL: defaultTTL ?? 60000,
      enableMetrics: true,
      ...config,
    });
    return strategy;
  }

  /**
   * Create an LFU cache strategy
   *
   * @param capacity - Maximum number of entries
   * @param defaultTTL - Default TTL in milliseconds (optional)
   * @param config - Additional configuration options (optional)
   * @returns Configured LFU cache strategy
   */
  static createLFU(
    capacity: number,
    defaultTTL?: number,
    config?: Partial<CacheStrategyConfig>
  ): LFUCacheStrategy<unknown> {
    const strategy = new LFUCacheStrategy<unknown>();
    strategy.initialize({
      maxSize: capacity,
      defaultTTL: defaultTTL ?? 60000,
      enableMetrics: true,
      ...config,
    });
    return strategy;
  }

  /**
   * Create a TTL cache strategy
   *
   * @param defaultTTL - Default TTL in milliseconds
   * @param capacity - Maximum number of entries (optional)
   * @param config - Additional configuration options (optional)
   * @returns Configured TTL cache strategy
   */
  static createTTL(
    defaultTTL: number,
    capacity?: number,
    config?: Partial<CacheStrategyConfig & { slidingTTL?: boolean }>
  ): TTLCacheStrategy<unknown> {
    const strategy = new TTLCacheStrategy<unknown>();
    strategy.initialize({
      maxSize: capacity ?? 1000,
      defaultTTL,
      enableMetrics: true,
      ...config,
    });
    return strategy;
  }

  /**
   * Create a Two-Tier cache strategy (L1 memory + L2 distributed)
   *
   * @param l1Strategy - L1 (memory) cache strategy
   * @param l2StrategyOrStorage - L2 (distributed) cache strategy or storage
   * @param config - Two-tier configuration (optional)
   * @returns Configured Two-Tier cache strategy
   */
  static createTwoTier<T>(
    l1Strategy: ICacheStrategy<T>,
    l2StrategyOrStorage: ICacheStrategy<T> | IStorage<T>,
    config?: Partial<TwoTierCacheConfig>
  ): TwoTierCacheStrategy<T> {
    const strategy = new TwoTierCacheStrategy<T>(l1Strategy, l2StrategyOrStorage);
    return strategy;
  }

  /**
   * Create a cache strategy for a specific profile
   *
   * @param profile - Environment profile
   * @param strategyType - Strategy type ('lru', 'lfu', 'ttl', 'two-tier')
   * @param customConfig - Custom configuration overrides (optional)
   * @returns Configured cache strategy
   */
  static createForProfile(
    profile: CacheProfile,
    strategyType: 'lru' | 'lfu' | 'ttl' = 'lru',
    customConfig?: Partial<CacheStrategyConfig>
  ): ICacheStrategy<unknown> {
    const profileConfig = PROFILE_CONFIGS[profile];
    if (!profileConfig) {
      throw new CacheError(
        CacheErrorCode.INVALID_CONFIG,
        `Unknown profile: ${profile}. Available: ${Object.keys(PROFILE_CONFIGS).join(', ')}`
      );
    }

    const config = { ...profileConfig, ...customConfig };

    switch (strategyType) {
      case 'lru':
        return this.createLRU(config.maxSize, config.defaultTTL, config);
      case 'lfu':
        return this.createLFU(config.maxSize, config.defaultTTL, config);
      case 'ttl':
        return this.createTTL(config.defaultTTL, config.maxSize, config);
      default:
        throw new CacheError(
          CacheErrorCode.INVALID_CONFIG,
          `Unknown strategy type: ${strategyType}. Available: lru, lfu, ttl`
        );
    }
  }

  /**
   * Create a Two-Tier cache strategy for a specific profile
   *
   * @param profile - Environment profile
   * @param l1Strategy - L1 (memory) cache strategy
   * @param l2StrategyOrStorage - L2 (distributed) cache strategy or storage
   * @param customConfig - Custom configuration overrides (optional)
   * @returns Configured Two-Tier cache strategy
   */
  static createTwoTierForProfile<T>(
    profile: CacheProfile,
    l1Strategy: ICacheStrategy<T>,
    l2StrategyOrStorage: ICacheStrategy<T> | IStorage<T>,
    customConfig?: Partial<TwoTierCacheConfig>
  ): TwoTierCacheStrategy<T> {
    const profileConfig = TWO_TIER_PROFILE_CONFIGS[profile];
    if (!profileConfig) {
      throw new CacheError(
        CacheErrorCode.INVALID_CONFIG,
        `Unknown profile: ${profile}. Available: ${Object.keys(TWO_TIER_PROFILE_CONFIGS).join(', ')}`
      );
    }

    const config = { ...profileConfig, ...customConfig };
    const strategy = new TwoTierCacheStrategy<T>(l1Strategy, l2StrategyOrStorage);
    // Note: initialize must be called separately with the full config
    return strategy;
  }

  /**
   * Register a custom profile configuration
   *
   * @param name - Profile name
   * @param config - Profile configuration
   */
  static registerProfile(name: string, config: CacheStrategyConfig): void {
    this._customProfiles.set(name.toLowerCase(), config);
  }

  /**
   * Register a custom two-tier profile configuration
   *
   * @param name - Profile name
   * @param config - Two-tier profile configuration
   */
  static registerTwoTierProfile(name: string, config: TwoTierCacheConfig): void {
    this._customTwoTierProfiles.set(name.toLowerCase(), config);
  }

  /**
   * Get a custom profile configuration
   *
   * @param name - Profile name
   * @returns Profile configuration or undefined
   */
  static getCustomProfile(name: string): CacheStrategyConfig | undefined {
    return this._customProfiles.get(name.toLowerCase());
  }

  /**
   * Get a custom two-tier profile configuration
   *
   * @param name - Profile name
   * @returns Two-tier profile configuration or undefined
   */
  static getCustomTwoTierProfile(name: string): TwoTierCacheConfig | undefined {
    return this._customTwoTierProfiles.get(name.toLowerCase());
  }

  /**
   * List all available profiles (built-in + custom)
   *
   * @returns Array of profile names
   */
  static getAvailableProfiles(): string[] {
    const builtIn = Object.keys(PROFILE_CONFIGS);
    const custom = Array.from(this._customProfiles.keys());
    return [...builtIn, ...custom];
  }

  /**
   * Create a cache strategy from a custom profile
   *
   * @param profileName - Custom profile name
   * @param strategyType - Strategy type
   * @param customConfig - Additional configuration overrides
   * @returns Configured cache strategy
   */
  static createFromCustomProfile(
    profileName: string,
    strategyType: 'lru' | 'lfu' | 'ttl' = 'lru',
    customConfig?: Partial<CacheStrategyConfig>
  ): ICacheStrategy<unknown> {
    const profileConfig = this._customProfiles.get(profileName.toLowerCase());
    if (!profileConfig) {
      throw new CacheError(
        CacheErrorCode.INVALID_CONFIG,
        `Custom profile not found: ${profileName}. Available: ${Array.from(this._customProfiles.keys()).join(', ')}`
      );
    }

    const config = { ...profileConfig, ...customConfig };

    switch (strategyType) {
      case 'lru':
        return this.createLRU(config.maxSize, config.defaultTTL, config);
      case 'lfu':
        return this.createLFU(config.maxSize, config.defaultTTL, config);
      case 'ttl':
        return this.createTTL(config.defaultTTL, config.maxSize, config);
      default:
        throw new CacheError(
          CacheErrorCode.INVALID_CONFIG,
          `Unknown strategy type: ${strategyType}. Available: lru, lfu, ttl`
        );
    }
  }
}

/**
 * Cache Factory Options
 */
export interface CacheFactoryOptions {
  /** Default profile to use */
  defaultProfile?: CacheProfile;
  /** Custom profiles */
  customProfiles?: Record<string, CacheStrategyConfig>;
  /** Custom two-tier profiles */
  customTwoTierProfiles?: Record<string, TwoTierCacheConfig>;
}

/**
 * Create a configured CacheFactory instance
 */
export function createCacheFactory(options: CacheFactoryOptions = {}): CacheFactory {
  const factory = new CacheFactory();

  if (options.customProfiles) {
    for (const [name, config] of Object.entries(options.customProfiles)) {
      CacheFactory.registerProfile(name, config);
    }
  }

  if (options.customTwoTierProfiles) {
    for (const [name, config] of Object.entries(options.customTwoTierProfiles)) {
      CacheFactory.registerTwoTierProfile(name, config);
    }
  }

  return factory;
}
