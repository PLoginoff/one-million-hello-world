/**
 * Cache Configuration Profiles
 *
 * Pre-defined configuration profiles for different environments.
 * Each profile provides optimized settings for its target environment.
 *
 * @module CacheLayer/Configuration
 */

import { InvalidationStrategy } from '../../types/cache-types';
import { CacheConfigOptions } from './DefaultConfigs';

/**
 * Environment profile type
 */
export type CacheEnvironmentProfile = 'development' | 'staging' | 'production' | 'test' | 'high-performance' | 'large-cache' | 'edge';

/**
 * Profile configuration with metadata
 */
export interface CacheProfileConfig {
  /** Profile name */
  name: CacheEnvironmentProfile;
  /** Human-readable description */
  description: string;
  /** Configuration options */
  config: CacheConfigOptions;
  /** Recommended strategy */
  recommendedStrategy: string;
  /** Whether Redis is recommended */
  redisRecommended: boolean;
  /** Whether clustering is recommended */
  clusterRecommended: boolean;
  /** Tags for categorization */
  tags: string[];
}

/**
 * Development Profile
 * - Debug logging
 * - Small cache size for fast iteration
 * - Short TTL for quick cache invalidation
 * - Low retries for fast failure detection
 */
export const DEVELOPMENT_PROFILE: CacheProfileConfig = {
  name: 'development',
  description: 'Development environment with debug logging and fast feedback',
  config: {
    maxSize: 1000,
    defaultTTL: 60000,
    invalidationStrategy: InvalidationStrategy.LRU,
    enableMultiLevel: false,
  },
  recommendedStrategy: 'lru',
  redisRecommended: false,
  clusterRecommended: false,
  tags: ['dev', 'local', 'debug'],
};

/**
 * Staging Profile
 * - Balanced settings
 * - Medium cache size
 * - Moderate TTL
 * - Standard retries
 */
export const STAGING_PROFILE: CacheProfileConfig = {
  name: 'staging',
  description: 'Staging environment with production-like settings',
  config: {
    maxSize: 10000,
    defaultTTL: 300000,
    invalidationStrategy: InvalidationStrategy.LRU,
    enableMultiLevel: false,
  },
  recommendedStrategy: 'lru',
  redisRecommended: true,
  clusterRecommended: false,
  tags: ['staging', 'pre-prod', 'balanced'],
};

/**
 * Production Profile
 * - Optimized for performance and reliability
 * - Large cache size
 * - Longer TTL
 * - Higher retries
 * - Warn-level logging
 * - Redis recommended
 */
export const PRODUCTION_PROFILE: CacheProfileConfig = {
  name: 'production',
  description: 'Production environment optimized for performance and reliability',
  config: {
    maxSize: 100000,
    defaultTTL: 3600000,
    invalidationStrategy: InvalidationStrategy.LFU,
    enableMultiLevel: true,
  },
  recommendedStrategy: 'lfu',
  redisRecommended: true,
  clusterRecommended: true,
  tags: ['prod', 'production', 'optimized'],
};

/**
 * Test Profile
 * - Fast execution
 * - Predictable behavior
 * - Small cache
 * - No retries
 * - Short TTL
 */
export const TEST_PROFILE: CacheProfileConfig = {
  name: 'test',
  description: 'Test environment with fast, predictable behavior',
  config: {
    maxSize: 100,
    defaultTTL: 1000,
    invalidationStrategy: InvalidationStrategy.LRU,
    enableMultiLevel: false,
  },
  recommendedStrategy: 'lru',
  redisRecommended: false,
  clusterRecommended: false,
  tags: ['test', 'ci', 'fast'],
};

/**
 * High-Performance Profile
 * - Optimized for maximum throughput
 * - Medium cache with LRU
 * - Short TTL for freshness
 * - Metrics enabled
 */
export const HIGH_PERFORMANCE_PROFILE: CacheProfileConfig = {
  name: 'high-performance',
  description: 'High-throughput workloads with low latency requirements',
  config: {
    maxSize: 50000,
    defaultTTL: 120000,
    invalidationStrategy: InvalidationStrategy.LRU,
    enableMultiLevel: false,
  },
  recommendedStrategy: 'lru',
  redisRecommended: true,
  clusterRecommended: false,
  tags: ['performance', 'throughput', 'low-latency'],
};

/**
 * Large Cache Profile
 * - Optimized for maximum capacity
 * - Very large cache size
 * - Long TTL
 * - LFU for better hit rates on large datasets
 */
export const LARGE_CACHE_PROFILE: CacheProfileConfig = {
  name: 'large-cache',
  description: 'Large dataset caching with capacity optimization',
  config: {
    maxSize: 1000000,
    defaultTTL: 7200000,
    invalidationStrategy: InvalidationStrategy.LFU,
    enableMultiLevel: true,
  },
  recommendedStrategy: 'lfu',
  redisRecommended: true,
  clusterRecommended: true,
  tags: ['large', 'capacity', 'big-data'],
};

/**
 * Edge Profile
 * - Optimized for edge computing
 * - Small cache size
 * - Very short TTL
 * - Minimal memory footprint
 */
export const EDGE_PROFILE: CacheProfileConfig = {
  name: 'edge',
  description: 'Edge computing environments with resource constraints',
  config: {
    maxSize: 500,
    defaultTTL: 30000,
    invalidationStrategy: InvalidationStrategy.TIME_BASED,
    enableMultiLevel: false,
  },
  recommendedStrategy: 'ttl',
  redisRecommended: false,
  clusterRecommended: false,
  tags: ['edge', 'iot', 'constrained'],
};

/**
 * All profiles registry
 */
export const CACHE_PROFILES: Record<CacheEnvironmentProfile, CacheProfileConfig> = {
  development: DEVELOPMENT_PROFILE,
  staging: STAGING_PROFILE,
  production: PRODUCTION_PROFILE,
  test: TEST_PROFILE,
  'high-performance': HIGH_PERFORMANCE_PROFILE,
  'large-cache': LARGE_CACHE_PROFILE,
  edge: EDGE_PROFILE,
};

/**
 * Get a profile by name
 */
export function getProfile(profile: CacheEnvironmentProfile): CacheProfileConfig {
  const profileConfig = CACHE_PROFILES[profile];
  if (!profileConfig) {
    throw new Error(`Unknown cache profile: ${profile}. Available: ${Object.keys(CACHE_PROFILES).join(', ')}`);
  }
  return profileConfig;
}

/**
 * Get all available profiles
 */
export function getAllProfiles(): CacheProfileConfig[] {
  return Object.values(CACHE_PROFILES);
}

/**
 * Get profiles by tag
 */
export function getProfilesByTag(tag: string): CacheProfileConfig[] {
  return Object.values(CACHE_PROFILES).filter(p => p.tags.includes(tag));
}

/**
 * Create a custom profile
 */
export function createProfile(
  name: CacheEnvironmentProfile,
  description: string,
  config: CacheConfigOptions,
  options: {
    recommendedStrategy?: string;
    redisRecommended?: boolean;
    clusterRecommended?: boolean;
    tags?: string[];
  } = {}
): CacheProfileConfig {
  return {
    name,
    description,
    config,
    recommendedStrategy: options.recommendedStrategy ?? 'lru',
    redisRecommended: options.redisRecommended ?? false,
    clusterRecommended: options.clusterRecommended ?? false,
    tags: options.tags ?? ['custom'],
  };
}