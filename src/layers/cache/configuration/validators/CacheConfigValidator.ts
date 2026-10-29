/**
 * Cache Configuration Validator (Zod-based)
 *
 * Provides schema validation for cache configuration using Zod.
 * Supports environment-specific validation and detailed error messages.
 *
 * @module CacheLayer/Configuration
 */

import { z } from 'zod';
import { InvalidationStrategy } from '../../types/cache-types';
import { CacheConfigOptions } from '../defaults/DefaultConfigs';
import { CacheEnvironmentProfile, getProfile } from '../defaults/CacheProfiles';

/**
 * Zod schema for cache strategy configuration
 */
export const CacheStrategyConfigSchema = z.object({
  maxSize: z.number().int().positive().max(10000000, 'Max size cannot exceed 10,000,000'),
  defaultTTL: z.number().int().nonnegative().max(86400000, 'Default TTL cannot exceed 24 hours'),
  enableMetrics: z.boolean().optional().default(true),
  serializer: z.function().optional(),
  deserializer: z.function().optional(),
});

/**
 * Zod schema for Redis configuration
 */
export const RedisConfigSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().positive().max(65535, 'Invalid port'),
  password: z.string().optional(),
  db: z.number().int().min(0).max(15).optional().default(0),
  keyPrefix: z.string().optional().default('cache:'),
  connectionTimeout: z.number().int().positive().optional().default(5000),
  commandTimeout: z.number().int().positive().optional().default(3000),
  enableOfflineQueue: z.boolean().optional().default(true),
  retryStrategy: z.function().optional(),
  tls: z.boolean().optional().default(false),
  maxPoolSize: z.number().int().positive().optional().default(10),
  minPoolSize: z.number().int().nonnegative().optional().default(2),
  idleTimeout: z.number().int().positive().optional().default(30000),
  readFromReplica: z.boolean().optional().default(false),
});

/**
 * Zod schema for Cluster configuration
 */
export const ClusterConfigSchema = z.object({
  nodes: z.array(z.object({
    host: z.string().min(1),
    port: z.number().int().positive().max(65535),
  })).min(1, 'At least one cluster node required'),
  password: z.string().optional(),
  keyPrefix: z.string().optional().default('cache:'),
  enableReadReplicas: z.boolean().optional().default(true),
  maxRedirections: z.number().int().positive().optional().default(3),
  slotRefreshInterval: z.number().int().positive().optional().default(60000),
  enableClientSideCaching: z.boolean().optional().default(false),
});

/**
 * Zod schema for Two-Tier configuration
 */
export const TwoTierConfigSchema = z.object({
  l1: CacheStrategyConfigSchema,
  l2: CacheStrategyConfigSchema,
  promoteOnL2Hit: z.boolean().optional().default(true),
  writeThrough: z.boolean().optional().default(true),
  writeBehind: z.boolean().optional().default(false),
  l2Timeout: z.number().int().positive().optional().default(100),
});

/**
 * Zod schema for Segmented configuration
 */
export const SegmentConfigSchema = z.object({
  id: z.string().min(1),
  strategy: z.enum(['LRU', 'LFU', 'TTL', 'FIFO', 'Random']),
  maxSize: z.number().int().positive(),
  defaultTTL: z.number().int().nonnegative(),
  keyPattern: z.union([z.string(), z.instanceof(RegExp)]).optional(),
  hashFunction: z.function().optional(),
});

export const SegmentedConfigSchema = z.object({
  segments: z.array(SegmentConfigSchema).min(1, 'At least one segment required'),
  defaultSegment: z.string().min(1),
  enableCrossSegmentOps: z.boolean().optional().default(true),
});

/**
 * Main cache configuration schema
 */
export const CacheConfigSchema = z.object({
  // Core settings
  enabled: z.boolean().default(true),
  timeout: z.number().int().min(1000, 'Timeout must be at least 1000ms').max(300000).default(30000),
  retries: z.number().int().min(0).max(10).default(3),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  strategy: z.enum(['default', 'fast', 'reliable', 'cached', 'batch', 'lru', 'lfu', 'ttl', 'fifo', 'random', 'two-tier', 'segmented']).default('lru'),

  // Cache-specific settings
  maxSize: z.number().int().positive().max(10000000).default(10000),
  defaultTTL: z.number().int().nonnegative().max(86400000).default(300000),
  invalidationStrategy: z.nativeEnum(InvalidationStrategy).default(InvalidationStrategy.LRU),
  enableMultiLevel: z.boolean().default(false),

  // Optional advanced configurations
  redis: RedisConfigSchema.optional(),
  cluster: ClusterConfigSchema.optional(),
  twoTier: TwoTierConfigSchema.optional(),
  segmented: SegmentedConfigSchema.optional(),

  // Profile-based configuration
  profile: z.enum(['development', 'staging', 'production', 'test', 'high-performance', 'large-cache', 'edge']).optional(),

  // Custom options
  options: z.record(z.unknown()).optional().default({}),
});

/**
 * Partial schema for updates
 */
export const PartialCacheConfigSchema = CacheConfigSchema.partial();

/**
 * Type inferred from schema
 */
export type CacheConfig = z.infer<typeof CacheConfigSchema>;
export type PartialCacheConfig = z.infer<typeof PartialCacheConfigSchema>;

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  data?: CacheConfig;
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  code: string;
}

/**
 * Cache Configuration Validator using Zod
 */
export class CacheConfigValidator {
  private _schema: z.ZodSchema<any>;

  constructor(schema?: z.ZodSchema<any>) {
    this._schema = schema ?? CacheConfigSchema;
  }

  /**
   * Validate maxSize field
   */
  static validateMaxSize(maxSize: number): void {
    if (!Number.isInteger(maxSize) || maxSize <= 0) {
      throw new Error(`Invalid maxSize: ${maxSize}. Must be a positive integer.`);
    }
    if (maxSize > 1000000) {
      throw new Error(`Invalid maxSize: ${maxSize}. Cannot exceed 10,000,000.`);
    }
  }

  /**
   * Validate defaultTTL field
   */
  static validateDefaultTTL(ttl: number): void {
    if (!Number.isInteger(ttl) || ttl < 0) {
      throw new Error(`Invalid defaultTTL: ${ttl}. Must be a non-negative integer.`);
    }
    if (ttl > 86400000) {
      throw new Error(`Invalid defaultTTL: ${ttl}. Cannot exceed 86,400,000ms (24 hours).`);
    }
  }

  /**
   * Validate invalidationStrategy field
   */
  static validateInvalidationStrategy(strategy: InvalidationStrategy): void {
    const valid = Object.values(InvalidationStrategy).includes(strategy);
    if (!valid) {
      throw new Error(`Invalid invalidationStrategy: ${strategy}.`);
    }
  }

  /**
   * Validate enableMultiLevel field
   */
  static validateMultiLevel(value: boolean): void {
    if (typeof value !== 'boolean') {
      throw new Error(`Invalid enableMultiLevel: ${value}. Must be a boolean.`);
    }
  }

  /**
   * Validate a complete configuration (static)
   */
  static validate(config: unknown): void {
    CacheConfigSchema.parse(config);
  }

  /**
   * Validate a partial configuration (static)
   */
  static validatePartial(config: unknown): void {
    PartialCacheConfigSchema.parse(config);
  }

  /**
   * Validate a complete configuration
   */
  validate(config: unknown): ValidationResult {
    const result = this._schema.safeParse(config);

    if (result.success) {
      return {
        valid: true,
        errors: [],
        warnings: this._generateWarnings(result.data),
        data: result.data,
      };
    }

    const errors: ValidationError[] = result.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    return {
      valid: false,
      errors,
      warnings: [],
    };
  }

  /**
   * Validate and throw on error
   */
  validateOrThrow(config: unknown): CacheConfig {
    const result = this.validate(config);
    if (!result.valid) {
      const errorMessages = result.errors.map(e => `${e.path}: ${e.message}`).join('; ');
      throw new Error(`Cache configuration validation failed: ${errorMessages}`);
    }
    return result.data!;
  }

  /**
   * Validate partial configuration
   */
  validatePartial(config: unknown): ValidationResult {
    const result = PartialCacheConfigSchema.safeParse(config);

    if (result.success) {
      return {
        valid: true,
        errors: [],
        warnings: this._generateWarnings(result.data as CacheConfig),
        data: result.data as CacheConfig,
      };
    }

    const errors: ValidationError[] = result.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    return {
      valid: false,
      errors,
      warnings: [],
    };
  }

  /**
   * Validate configuration for a specific profile
   */
  validateForProfile(config: unknown, profile: CacheEnvironmentProfile): ValidationResult {
    const profileConfig = getProfile(profile);
    const mergedConfig = this._mergeWithProfile(config, profileConfig.config);
    return this.validate(mergedConfig);
  }

  /**
   * Get the schema for external use
   */
  getSchema(): z.ZodSchema<CacheConfig> {
    return this._schema;
  }

  /**
   * Create a custom validator with extended schema
   */
  static extend(extensions: z.ZodRawShape): CacheConfigValidator {
    const extendedSchema = CacheConfigSchema.extend(extensions);
    return new CacheConfigValidator(extendedSchema);
  }

  /**
   * Generate warnings based on configuration
   */
  private _generateWarnings(config: CacheConfig): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Warn about small cache size
    if (config.maxSize < 100) {
      warnings.push({
        path: 'maxSize',
        message: 'Cache size is very small, consider increasing for better hit rates',
        code: 'SMALL_CACHE_SIZE',
      });
    }

    // Warn about very large cache size
    if (config.maxSize > 1000000) {
      warnings.push({
        path: 'maxSize',
        message: 'Cache size is very large, ensure sufficient memory is available',
        code: 'LARGE_CACHE_SIZE',
      });
    }

    // Warn about zero TTL (no expiration)
    if (config.defaultTTL === 0) {
      warnings.push({
        path: 'defaultTTL',
        message: 'TTL is disabled, entries will never expire automatically',
        code: 'NO_TTL',
      });
    }

    // Warn about very short TTL
    if (config.defaultTTL > 0 && config.defaultTTL < 1000) {
      warnings.push({
        path: 'defaultTTL',
        message: 'TTL is very short, entries will expire quickly',
        code: 'SHORT_TTL',
      });
    }

    // Warn about multi-level without Redis
    if (config.enableMultiLevel && !config.redis && !config.cluster) {
      warnings.push({
        path: 'enableMultiLevel',
        message: 'Multi-level caching enabled but no Redis/Cluster configured',
        code: 'MULTI_LEVEL_NO_BACKEND',
      });
    }

    // Warn about strategy/profile mismatch
    if (config.profile) {
      const profileConfig = getProfile(config.profile);
      if (config.strategy !== profileConfig.recommendedStrategy) {
        warnings.push({
          path: 'strategy',
          message: `Strategy '${config.strategy}' differs from profile recommendation '${profileConfig.recommendedStrategy}'`,
          code: 'STRATEGY_PROFILE_MISMATCH',
        });
      }
    }

    return warnings;
  }

  /**
   * Merge config with profile defaults
   */
  private _mergeWithProfile(config: unknown, profileConfig: CacheConfigOptions): Record<string, unknown> {
    const baseConfig = config as Record<string, unknown>;
    return {
      ...profileConfig,
      ...baseConfig,
      // Ensure nested objects are merged
      redis: baseConfig.redis ? { ...(profileConfig as any).redis, ...baseConfig.redis } : (profileConfig as any).redis,
      cluster: baseConfig.cluster ? { ...(profileConfig as any).cluster, ...baseConfig.cluster } : (profileConfig as any).cluster,
    };
  }
}

/**
 * Pre-configured validators for common use cases
 */
export const Validators = {
  /** Standard validator */
  standard: new CacheConfigValidator(),

  /** Strict validator (no warnings, throws on any issue) */
  strict: new CacheConfigValidator(
    CacheConfigSchema.refine(() => true, { message: 'Strict mode' })
  ),

  /** Validator for profile-based configs */
  forProfile(profile: CacheEnvironmentProfile): CacheConfigValidator {
    const profileConfig = getProfile(profile);
    const profileSchema = CacheConfigSchema.extend({
      profile: z.literal(profile),
    }).transform(data => ({
      ...profileConfig.config,
      ...data,
      redis: data.redis ?? (profileConfig.redisRecommended ? {} : undefined),
      cluster: data.cluster ?? (profileConfig.clusterRecommended ? {} : undefined),
    }));
    return new CacheConfigValidator(profileSchema);
  },

  /** Validator for Redis-backed configs */
  redis: new CacheConfigValidator(
    CacheConfigSchema.extend({
      redis: RedisConfigSchema,
    }).required({ redis: true })
  ),

  /** Validator for Cluster-backed configs */
  cluster: new CacheConfigValidator(
    CacheConfigSchema.extend({
      cluster: ClusterConfigSchema,
    }).required({ cluster: true })
  ),
};