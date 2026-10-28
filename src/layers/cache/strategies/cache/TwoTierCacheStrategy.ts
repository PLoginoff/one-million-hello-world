/**
 * Two-Tier Cache Strategy
 *
 * Implements L1 (memory) + L2 (Redis) tiered caching.
 * L1 provides ultra-fast access for hot data, L2 provides larger capacity with persistence.
 *
 * @module CacheLayer/Strategies
 */

import {
  ICacheStrategy,
  IMultiLevelCacheStrategy,
  CacheStrategyConfig,
  CacheGetResult,
  CacheSetResult,
} from './ICacheStrategy';
import { CacheEntry } from '../../domain/entities/CacheEntry';
import { CacheStats } from '../../domain/value-objects/CacheStats';
import { CacheError, CacheErrorCode } from '../../errors';
import { IStorage } from '../../storage/interfaces/IStorage';

/**
 * Configuration for Two-Tier Cache Strategy
 */
export interface TwoTierCacheConfig extends CacheStrategyConfig {
  /** L1 (memory) cache configuration */
  l1: CacheStrategyConfig;
  /** L2 (distributed) cache configuration */
  l2: CacheStrategyConfig;
  /** Whether to promote L2 hits to L1 */
  promoteOnL2Hit: boolean;
  /** Whether to write-through to L2 on L1 set */
  writeThrough: boolean;
  /** Whether to write-behind (async) to L2 */
  writeBehind: boolean;
  /** Maximum time to wait for L2 operations (ms) */
  l2Timeout: number;
}

/**
 * Two-Tier Cache Strategy Implementation
 *
 * L1: In-memory cache (fast, small capacity)
 * L2: Distributed cache (slower, large capacity, persistent)
 *
 * Read path: L1 -> L2 -> miss
 * Write path: L1 (+ L2 if writeThrough) or L1 + async L2 (writeBehind)
 */
export class TwoTierCacheStrategy<T = unknown> implements IMultiLevelCacheStrategy<T> {
  readonly name = 'TwoTier';
  readonly version = '1.0.0';

  private _config!: TwoTierCacheConfig;
  private _l1Strategy: ICacheStrategy<T>;
  private _l2Strategy: ICacheStrategy<T> | null;
  private _l2Storage: IStorage<T> | null;
  private _stats: CacheStats;
  private _l1Stats: CacheStats;
  private _l2Stats: CacheStats;
  private _initialized: boolean;
  private _writeBehindQueue: Array<{ key: string; value: T; ttl?: number }>;
  private _writeBehindProcessing: boolean;

  constructor(l1Strategy: ICacheStrategy<T>, l2Strategy?: ICacheStrategy<T> | IStorage<T>) {
    this._l1Strategy = l1Strategy;
    // Use duck typing to distinguish between ICacheStrategy and IStorage
    this._l2Strategy = l2Strategy && 'initialize' in l2Strategy ? l2Strategy : null;
    this._l2Storage = l2Strategy && 'get' in l2Strategy && !('initialize' in l2Strategy) ? l2Strategy : null;
    this._stats = new CacheStats();
    this._l1Stats = new CacheStats();
    this._l2Stats = new CacheStats();
    this._initialized = false;
    this._writeBehindQueue = [];
    this._writeBehindProcessing = false;
  }

  /**
   * Get the L1 (primary) cache strategy
   */
  get l1Strategy(): ICacheStrategy<T> {
    return this._l1Strategy;
  }

  /**
   * Get the L2 (secondary) cache strategy
   */
  get l2Strategy(): ICacheStrategy<T> | null {
    return this._l2Strategy;
  }

  /**
   * Initialize the strategy with configuration
   */
  async initialize(config: TwoTierCacheConfig): Promise<void> {
    if (this._initialized) {
      throw new CacheError(CacheErrorCode.INVALID_CONFIG, 'Strategy already initialized');
    }

    this._config = {
      maxSize: config.maxSize,
      defaultTTL: config.defaultTTL,
      enableMetrics: config.enableMetrics ?? true,
      serializer: config.serializer,
      deserializer: config.deserializer,
      l1: config.l1,
      l2: config.l2,
      promoteOnL2Hit: config.promoteOnL2Hit ?? true,
      writeThrough: config.writeThrough ?? true,
      writeBehind: config.writeBehind ?? false,
      l2Timeout: config.l2Timeout ?? 100,
    };

    // Initialize L1
    await this._l1Strategy.initialize(this._config.l1);

    // Initialize L2 if available
    if (this._l2Strategy) {
      await this._l2Strategy.initialize(this._config.l2);
    }

    this._initialized = true;
  }

  /**
   * Get a value from the cache (L1 -> L2)
   */
  async get(key: string): Promise<CacheGetResult<T>> {
    this._ensureInitialized();

    // Try L1 first
    const l1Result = await this._l1Strategy.get(key);
    if (l1Result.hit) {
      this._l1Stats = this._l1Stats.withHit();
      this._stats = this._stats.withHit();
      return { ...l1Result, level: 'L1' };
    }

    this._l1Stats = this._l1Stats.withMiss();

    // Try L2 if available
    if (this._l2Strategy) {
      try {
        const l2Result = await this._withTimeout(this._l2Strategy.get(key), this._config.l2Timeout);
        if (l2Result.hit) {
          this._l2Stats = this._l2Stats.withHit();
          this._stats = this._stats.withHit();

          // Promote to L1 if configured
          if (this._config.promoteOnL2Hit && l2Result.value !== undefined) {
            await this._l1Strategy.set(key, l2Result.value, l2Result.entry?.ttl);
          }

          return { ...l2Result, level: 'L2' };
        }
        this._l2Stats = this._l2Stats.withMiss();
      } catch (error) {
        // L2 error - log and continue as miss
        this._l2Stats = this._l2Stats.withMiss();
      }
    } else if (this._l2Storage) {
      try {
        const entry = this._l2Storage.get(key);
        if (entry) {
          const now = Date.now();
          if (entry.ttl <= 0 || now - entry.createdAt <= entry.ttl) {
            this._l2Stats = this._l2Stats.withHit();
            this._stats = this._stats.withHit();

            if (this._config.promoteOnL2Hit) {
              await this._l1Strategy.set(key, entry.value, entry.ttl);
            }

            return {
              hit: true,
              value: entry.value,
              entry,
              level: 'L2',
            };
          } else {
            // Expired in L2
            this._l2Storage.delete(key);
          }
        }
        this._l2Stats = this._l2Stats.withMiss();
      } catch (error) {
        this._l2Stats = this._l2Stats.withMiss();
      }
    }

    this._stats = this._stats.withMiss();
    return { hit: false };
  }

  /**
   * Set a value in the cache (L1 + optionally L2)
   */
  async set(key: string, value: T, ttl?: number): Promise<CacheSetResult> {
    this._ensureInitialized();

    const effectiveTTL = ttl ?? this._config.defaultTTL;

    // Always write to L1
    const l1Result = await this._l1Strategy.set(key, value, effectiveTTL);
    this._l1Stats = this._l1Stats.withSize((await this._l1Strategy.size()) ?? 0);
    this._stats = this._stats.withSize(this._l1Stats.size + this._l2Stats.size);

    // Handle L2 write
    if (this._l2Strategy || this._l2Storage) {
      if (this._config.writeThrough) {
        // Synchronous write-through
        await this._writeToL2(key, value, effectiveTTL);
      } else if (this._config.writeBehind) {
        // Asynchronous write-behind
        this._enqueueWriteBehind(key, value, effectiveTTL);
      }
    }

    return { ...l1Result, key };
  }

  /**
   * Delete a value from both tiers
   */
  async delete(key: string): Promise<boolean> {
    this._ensureInitialized();

    const l1Deleted = await this._l1Strategy.delete(key);
    let l2Deleted = false;

    if (this._l2Strategy) {
      l2Deleted = await this._l2Strategy.delete(key);
    } else if (this._l2Storage) {
      l2Deleted = this._l2Storage.delete(key);
    }

    this._l1Stats = this._l1Stats.withSize((await this._l1Strategy.size()) ?? 0);
    this._l2Stats = this._l2Stats.withSize(
      this._l2Strategy ? ((await this._l2Strategy.size()) ?? 0) : (this._l2Storage?.size() ?? 0)
    );
    this._stats = this._stats.withSize(this._l1Stats.size + this._l2Stats.size);

    return l1Deleted || l2Deleted;
  }

  /**
   * Clear all entries from both tiers
   */
  async clear(): Promise<void> {
    this._ensureInitialized();

    await this._l1Strategy.clear();
    if (this._l2Strategy) {
      await this._l2Strategy.clear();
    } else if (this._l2Storage) {
      this._l2Storage.clear();
    }

    this._l1Stats = new CacheStats();
    this._l2Stats = new CacheStats();
    this._stats = new CacheStats();
    this._writeBehindQueue = [];
  }

  /**
   * Get combined cache statistics
   */
  getStats(): CacheStats {
    return this._stats;
  }

  /**
   * Get L1-specific statistics
   */
  getL1Stats(): CacheStats {
    return this._l1Stats;
  }

  /**
   * Get L2-specific statistics
   */
  getL2Stats(): CacheStats {
    return this._l2Stats;
  }

  /**
   * Check if a key exists in either tier
   */
  async has(key: string): Promise<boolean> {
    this._ensureInitialized();

    if (await this._l1Strategy.has(key)) {
      return true;
    }

    if (this._l2Strategy) {
      return await this._l2Strategy.has(key);
    }

    if (this._l2Storage) {
      return this._l2Storage.has(key);
    }

    return false;
  }

  /**
   * Get all keys from both tiers
   */
  async keys(): Promise<string[]> {
    this._ensureInitialized();

    const l1Keys = await this._l1Strategy.keys();
    let l2Keys: string[] = [];

    if (this._l2Strategy) {
      l2Keys = await this._l2Strategy.keys();
    } else if (this._l2Storage) {
      l2Keys = this._l2Storage.keys();
    }

    // Combine and deduplicate
    const allKeys = new Set([...l1Keys, ...l2Keys]);
    return Array.from(allKeys);
  }

  /**
   * Get the current number of entries across both tiers
   */
  async size(): Promise<number> {
    this._ensureInitialized();

    const l1Size = await this._l1Strategy.size();
    const l2Size = this._l2Strategy ? await this._l2Strategy.size() : (this._l2Storage?.size() ?? 0);

    this._l1Stats = this._l1Stats.withSize(l1Size);
    this._l2Stats = this._l2Stats.withSize(l2Size);
    this._stats = this._stats.withSize(l1Size + l2Size);

    return this._stats.size;
  }

  /**
   * Perform maintenance on both tiers
   */
  async maintenance(): Promise<number> {
    this._ensureInitialized();

    const l1Cleaned = await this._l1Strategy.maintenance();
    let l2Cleaned = 0;

    if (this._l2Strategy) {
      l2Cleaned = await this._l2Strategy.maintenance();
    } else if (this._l2Storage) {
      this._l2Storage.cleanup();
      // Can't get exact count from storage interface
    }

    return l1Cleaned + l2Cleaned;
  }

  /**
   * Promote a key from L2 to L1
   */
  async promote(key: string): Promise<boolean> {
    this._ensureInitialized();

    if (!this._l2Strategy && !this._l2Storage) {
      return false;
    }

    let entry: CacheEntry<T> | null = null;

    if (this._l2Strategy) {
      const result = await this._l2Strategy.get(key);
      if (result.hit && result.entry) {
        entry = result.entry;
      }
    } else if (this._l2Storage) {
      entry = this._l2Storage.get(key);
    }

    if (!entry) {
      return false;
    }

    const now = Date.now();
    if (entry.ttl > 0 && now - entry.createdAt > entry.ttl) {
      // Expired, remove from L2
      if (this._l2Strategy) {
        await this._l2Strategy.delete(key);
      } else if (this._l2Storage) {
        this._l2Storage.delete(key);
      }
      return false;
    }

    await this._l1Strategy.set(key, entry.value, entry.ttl);
    return true;
  }

  /**
   * Demote a key from L1 to L2 (remove from L1, keep in L2)
   */
  async demote(key: string): Promise<boolean> {
    this._ensureInitialized();

    const l1Result = await this._l1Strategy.get(key);
    if (!l1Result.hit || !l1Result.value) {
      return false;
    }

    // Ensure it's in L2
    if (this._l2Strategy) {
      await this._l2Strategy.set(key, l1Result.value, l1Result.entry?.ttl);
    } else if (this._l2Storage) {
      const entry = new CacheEntry(
        key,
        l1Result.value,
        l1Result.entry?.ttl ?? this._config.defaultTTL,
        Date.now()
      );
      this._l2Storage.set(key, entry);
    }

    // Remove from L1
    await this._l1Strategy.delete(key);
    return true;
  }

  /**
   * Shutdown the strategy and release resources
   */
  async shutdown(): Promise<void> {
    // Process any pending write-behind operations
    await this._flushWriteBehind();

    await this._l1Strategy.shutdown();
    if (this._l2Strategy) {
      await this._l2Strategy.shutdown();
    }

    this._initialized = false;
  }

  // Private helper methods

  private _ensureInitialized(): void {
    if (!this._initialized) {
      throw new CacheError(CacheErrorCode.INVALID_CONFIG, 'Strategy not initialized. Call initialize() first.');
    }
  }

  private async _writeToL2(key: string, value: T, ttl: number): Promise<void> {
    try {
      if (this._l2Strategy) {
        await this._withTimeout(this._l2Strategy.set(key, value, ttl), this._config.l2Timeout);
        this._l2Stats = this._l2Stats.withSize((await this._l2Strategy.size()) ?? 0);
      } else if (this._l2Storage) {
        const entry = new CacheEntry(key, value, ttl, Date.now());
        this._l2Storage.set(key, entry);
        this._l2Stats = this._l2Stats.withSize(this._l2Storage.size());
      }
      this._stats = this._stats.withSize(this._l1Stats.size + this._l2Stats.size);
    } catch (error) {
      // Log error but don't fail the L1 operation
      console.error(`[TwoTierCache] L2 write failed for key ${key}:`, error);
    }
  }

  private _enqueueWriteBehind(key: string, value: T, ttl?: number): void {
    this._writeBehindQueue.push({ key, value, ttl });
    this._processWriteBehind();
  }

  private async _processWriteBehind(): Promise<void> {
    if (this._writeBehindProcessing || this._writeBehindQueue.length === 0) {
      return;
    }

    this._writeBehindProcessing = true;

    while (this._writeBehindQueue.length > 0) {
      const item = this._writeBehindQueue.shift()!;
      await this._writeToL2(item.key, item.value, item.ttl ?? this._config.defaultTTL);
    }

    this._writeBehindProcessing = false;
  }

  private async _flushWriteBehind(): Promise<void> {
    while (this._writeBehindQueue.length > 0) {
      await this._processWriteBehind();
    }
  }

  private _withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('L2 operation timeout')), timeoutMs)),
    ]);
  }
}