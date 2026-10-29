/**
 * Cache Strategy Factory
 *
 * Factory for creating cache strategies by name or configuration.
 * Supports strategy selection based on workload characteristics.
 *
 * @module CacheLayer/Factories
 */

import { ICacheStrategy, CacheStrategyConfig } from '@layers/cache/strategies/cache';
import { LRUCacheStrategy } from '@layers/cache/strategies/cache';
import { LFUCacheStrategy } from '@layers/cache/strategies/cache';
import { TTLCacheStrategy } from '@layers/cache/strategies/cache';
import { TwoTierCacheStrategy } from '@layers/cache/strategies/cache';
import { FIFOCacheStrategy } from '@layers/cache/strategies/cache';
import { RandomCacheStrategy } from '@layers/cache/strategies/cache';
import { SegmentedCacheStrategy } from '@layers/cache/strategies/cache';
import { CacheError, CacheErrorCode } from '@layers/cache/errors';

/**
 * Strategy type identifiers
 */
export type CacheStrategyType =
  | 'lru'
  | 'lfu'
  | 'ttl'
  | 'fifo'
  | 'random'
  | 'two-tier'
  | 'segmented';

/**
 * Strategy selection criteria
 */
export interface StrategySelectionCriteria {
  /** Expected access pattern */
  accessPattern?: 'uniform' | 'temporal' | 'frequency' | 'mixed';
  /** Expected cache size */
  expectedSize?: 'small' | 'medium' | 'large' | 'huge';
  /** Latency requirements */
  latencyRequirement?: 'low' | 'medium' | 'high';
  /** Whether persistence is needed */
  persistenceRequired?: boolean;
  /** Whether multi-level caching is needed */
  multiLevel?: boolean;
  /** Read/write ratio (0-1, higher = more reads) */
  readWriteRatio?: number;
  /** TTL importance */
  ttlImportance?: 'none' | 'low' | 'medium' | 'high';
}

/**
 * Strategy recommendation
 */
export interface StrategyRecommendation {
  /** Recommended strategy type */
  strategy: CacheStrategyType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasoning for recommendation */
  reasoning: string[];
  /** Alternative strategies */
  alternatives: CacheStrategyType[];
}

/**
 * Cache Strategy Factory
 *
 * Creates and manages cache strategy instances.
 * Provides strategy recommendation based on workload characteristics.
 */
export class CacheStrategyFactory {
  private _strategies: Map<string, () => ICacheStrategy<unknown>>;
  private _initializedStrategies: Map<string, ICacheStrategy<unknown>>;

  constructor() {
    this._strategies = new Map();
    this._initializedStrategies = new Map();

    // Register built-in strategies
    this._registerBuiltInStrategies();
  }

  /**
   * Register all built-in strategies
   */
  private _registerBuiltInStrategies(): void {
    this._strategies.set('lru', () => new LRUCacheStrategy());
    this._strategies.set('lfu', () => new LFUCacheStrategy());
    this._strategies.set('ttl', () => new TTLCacheStrategy());
    this._strategies.set('fifo', () => new FIFOCacheStrategy());
    this._strategies.set('random', () => new RandomCacheStrategy());
    this._strategies.set('segmented', () => new SegmentedCacheStrategy());
    // Two-tier requires L1 and L2 strategies, so it's created differently
  }

  /**
   * Create a strategy by name
   */
  create(name: string, config?: CacheStrategyConfig): ICacheStrategy<unknown> {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);

    if (!factory) {
      throw new CacheError(
        CacheErrorCode.INVALID_CONFIG,
        `Unknown cache strategy: ${name}. Available: ${this.getAvailableStrategies().join(', ')}`
      );
    }

    const strategy = factory();

    if (config) {
      strategy.initialize(config);
    }

    return strategy;
  }

  /**
   * Create a strategy by type with automatic configuration
   */
  createByType(type: CacheStrategyType, config?: Partial<CacheStrategyConfig>): ICacheStrategy<unknown> {
    const defaultConfig = this._getDefaultConfig(type);
    const mergedConfig = { ...defaultConfig, ...config };
    return this.create(type, mergedConfig);
  }

  /**
   * Create a Two-Tier cache strategy
   */
  createTwoTier(
    l1Strategy: ICacheStrategy<unknown>,
    l2Strategy?: ICacheStrategy<unknown>,
    config?: {
      promoteOnL2Hit?: boolean;
      writeThrough?: boolean;
      writeBehind?: boolean;
      l2Timeout?: number;
    }
  ): TwoTierCacheStrategy<unknown> {
    const twoTier = new TwoTierCacheStrategy(l1Strategy, l2Strategy);
    // TwoTierCacheStrategy has async initialize
    return twoTier;
  }

  /**
   * Create a Segmented cache strategy
   */
  async createSegmented(
    segments: Array<{
      id: string;
      strategy: 'LRU' | 'LFU' | 'TTL' | 'FIFO' | 'Random';
      maxSize: number;
      defaultTTL: number;
      keyPattern?: string | RegExp;
    }>,
    defaultSegment: string,
    config?: Partial<CacheStrategyConfig>
  ): Promise<SegmentedCacheStrategy<unknown>> {
    const segmented = new SegmentedCacheStrategy();
    const defaultConfig = this._getDefaultConfig('segmented');
    const mergedConfig = { ...defaultConfig, ...config };

    await segmented.initialize({
      ...mergedConfig,
      segments,
      defaultSegment,
      enableCrossSegmentOps: true,
    } as any);

    return segmented;
  }

  /**
   * Get default configuration for a strategy type
   */
  private _getDefaultConfig(type: CacheStrategyType): CacheStrategyConfig {
    const baseConfig: CacheStrategyConfig = {
      maxSize: 10000,
      defaultTTL: 300000, // 5 minutes
      enableMetrics: true,
    };

    switch (type) {
      case 'lru':
        return { ...baseConfig, maxSize: 10000 };
      case 'lfu':
        return { ...baseConfig, maxSize: 10000 };
      case 'ttl':
        return { ...baseConfig, maxSize: 50000, defaultTTL: 60000 };
      case 'fifo':
        return { ...baseConfig, maxSize: 10000 };
      case 'random':
        return { ...baseConfig, maxSize: 10000 };
      case 'two-tier':
        return { ...baseConfig, maxSize: 1000 };
      case 'segmented':
        return { ...baseConfig, maxSize: 100000 };
      default:
        return baseConfig;
    }
  }

  /**
   * Recommend a strategy based on workload criteria
   */
  recommend(criteria: StrategySelectionCriteria): StrategyRecommendation {
    const reasoning: string[] = [];
    let strategy: CacheStrategyType | 'ttl' | 'fifo' = 'lru';
    let confidence = 0.5;
    const alternatives: CacheStrategyType[] = [];

    // Analyze criteria
    const {
      accessPattern = 'mixed',
      expectedSize = 'medium',
      latencyRequirement = 'medium',
      persistenceRequired = false,
      multiLevel = false,
      readWriteRatio = 0.7,
      ttlImportance = 'low',
    } = criteria;

    // Multi-level requirement
    if (multiLevel || persistenceRequired) {
      strategy = 'two-tier';
      confidence = 0.9;
      reasoning.push('Multi-level caching or persistence required');
      alternatives.push('segmented');
    }
    // Access pattern analysis
    else if (accessPattern === 'temporal') {
      // Recent items accessed more frequently -> LRU
      strategy = 'lru';
      confidence = 0.85;
      reasoning.push('Temporal locality detected - LRU optimal for recent access patterns');
      alternatives.push('fifo', 'segmented');
    }
    else if (accessPattern === 'frequency') {
      // Frequently accessed items -> LFU
      strategy = 'lfu';
      confidence = 0.85;
      reasoning.push('Frequency-based access pattern - LFU optimal for hot/cold separation');
      alternatives.push('lru', 'segmented');
    }
    else if (accessPattern === 'uniform') {
      // Uniform access -> Random or FIFO (simple, low overhead)
      strategy = 'random';
      confidence = 0.7;
      reasoning.push('Uniform access pattern - Random eviction has minimal overhead');
      alternatives.push('fifo', 'lru');
    }
    else {
      // Mixed pattern -> Segmented or LRU
      strategy = 'segmented';
      confidence = 0.75;
      reasoning.push('Mixed access pattern - Segmented allows per-segment optimization');
      alternatives.push('lru', 'lfu');
    }

    // Size considerations
    if (expectedSize === 'huge' && strategy !== 'two-tier' && strategy !== 'segmented') {
      strategy = 'segmented';
      confidence = Math.min(confidence + 0.1, 0.95);
      reasoning.push('Large cache size benefits from segmentation');
    }

    // TTL importance
    const strat = strategy as CacheStrategyType | 'ttl' | 'fifo';
    if (ttlImportance === 'high' && strat !== 'ttl' && strat !== 'segmented') {
      if (strat === 'lru' || strat === 'lfu') {
        alternatives.unshift('ttl');
        reasoning.push('High TTL importance - consider TTL strategy as alternative');
      }
    }

    // Latency requirements
    if (latencyRequirement === 'low') {
      // Low latency = need fastest possible -> LRU or Random
      if (strat === 'lfu' || strat === 'segmented') {
        alternatives.unshift('lru', 'random');
        reasoning.push('Low latency requirement - simpler strategies (LRU, Random) have lower overhead');
      }
    }

    // Read/write ratio
    if (readWriteRatio > 0.9) {
      // Read-heavy -> LFU or Segmented for better hit rates
      if (strat === 'lru' || strat === 'fifo' || strat === 'random') {
        alternatives.unshift('lfu');
        reasoning.push('Read-heavy workload - LFU may provide better hit rates');
      }
    }

    return { strategy, confidence, reasoning, alternatives };
  }

  /**
   * Create strategy from recommendation
   */
  createFromRecommendation(recommendation: StrategyRecommendation, config?: Partial<CacheStrategyConfig>): ICacheStrategy<unknown> {
    return this.createByType(recommendation.strategy, config);
  }

  /**
   * Create default strategy (LRU)
   */
  createDefault(config?: CacheStrategyConfig): ICacheStrategy<unknown> {
    return this.create('lru', config);
  }

  /**
   * Register a custom strategy
   */
  registerStrategy(name: string, factory: () => ICacheStrategy<unknown>): void {
    this._strategies.set(name.toLowerCase(), factory);
  }

  /**
   * Unregister a strategy
   */
  unregisterStrategy(name: string): boolean {
    return this._strategies.delete(name.toLowerCase());
  }

  /**
   * Get available strategy names
   */
  getAvailableStrategies(): string[] {
    return Array.from(this._strategies.keys());
  }

  /**
   * Create all registered strategies
   */
  createAll(config?: CacheStrategyConfig): ICacheStrategy<unknown>[] {
    return Array.from(this._strategies.values()).map(factory => {
      const strategy = factory();
      if (config) {
        strategy.initialize(config);
      }
      return strategy;
    });
  }

  /**
   * Create strategies sorted by priority (if they have priority)
   */
  createByPriority(config?: CacheStrategyConfig): ICacheStrategy<unknown>[] {
    const strategies = this.createAll(config);
    return strategies.sort((a, b) => {
      const priorityA = (a as any).priority ?? 0;
      const priorityB = (b as any).priority ?? 0;
      return priorityB - priorityA;
    });
  }

  /**
   * Get a previously created strategy instance (singleton per name)
   */
  getOrCreate(name: string, config?: CacheStrategyConfig): ICacheStrategy<unknown> {
    const normalizedName = name.toLowerCase();

    if (this._initializedStrategies.has(normalizedName)) {
      return this._initializedStrategies.get(normalizedName)!;
    }

    const strategy = this.create(name, config);
    this._initializedStrategies.set(normalizedName, strategy);
    return strategy;
  }

  /**
   * Clear all cached strategy instances
   */
  clearCache(): void {
    this._initializedStrategies.clear();
  }

  /**
   * Get strategy metadata
   */
  getStrategyMetadata(name: string): { name: string; version: string; description: string } | null {
    const normalizedName = name.toLowerCase();
    const factory = this._strategies.get(normalizedName);

    if (!factory) {
      return null;
    }

    const strategy = factory();
    return {
      name: strategy.name,
      version: strategy.version,
      description: this._getStrategyDescription(normalizedName),
    };
  }

  private _getStrategyDescription(name: string): string {
    const descriptions: Record<string, string> = {
      lru: 'Least Recently Used - evicts the least recently accessed entry',
      lfu: 'Least Frequently Used - evicts the least frequently accessed entry',
      ttl: 'Time-To-Live - entries expire after a specified time',
      fifo: 'First-In-First-Out - evicts the oldest entry by insertion order',
      random: 'Random - evicts a random entry',
      'two-tier': 'Two-Tier - L1 memory cache + L2 distributed cache',
      segmented: 'Segmented - multiple independent cache segments with different strategies',
    };
    return descriptions[name] || 'Custom cache strategy';
  }
}

/**
 * Global strategy factory instance
 */
export const defaultCacheStrategyFactory = new CacheStrategyFactory();