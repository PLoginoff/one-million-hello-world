/**
 * Cache Layer Types
 * 
 * Type definitions for caching operations with TTL and eviction policies.
 */

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  data: T;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  enabled: boolean;
  defaultTTL: number;
  maxSize: number;
  evictionPolicy: EvictionPolicy;
  enableCompression: boolean;
  enableStats: boolean;
}

/**
 * Eviction policy
 */
export enum EvictionPolicy {
  LRU = 'LRU',
  LFU = 'LFU',
  FIFO = 'FIFO',
  TTL = 'TTL',
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  currentSize: number;
  totalEntries: number;
}

/**
 * Cache result
 */
export interface CacheResult<T> {
  success: boolean;
  data?: T;
  hit: boolean;
  error?: CacheError;
}

/**
 * Cache error
 */
export interface CacheError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Cache invalidation strategy
 */
export enum InvalidationStrategy {
  IMMEDIATE = 'IMMEDIATE',
  DELAYED = 'DELAYED',
  MANUAL = 'MANUAL',
}

/**
 * Cache key pattern
 */
export interface CacheKeyPattern {
  pattern: string;
  parameters: string[];
}
