/**
 * Cache Layer Types
 * 
 * This module defines all type definitions for the Cache Layer,
 * including multi-level caching and invalidation strategies.
 */

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  key: string;
  value: T;
  ttl: number;
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

/**
 * Invalidation strategy
 */
export enum InvalidationStrategy {
  TIME_BASED = 'TIME_BASED',
  LRU = 'LRU',
  LFU = 'LFU',
  MANUAL = 'MANUAL',
}

/**
 * Cache level
 */
export enum CacheLevel {
  L1 = 'L1',
  L2 = 'L2',
  L3 = 'L3',
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  invalidationStrategy: InvalidationStrategy;
  enableMultiLevel: boolean;
}

/**
 * Cache result
 */
export interface CacheResult<T> {
  hit: boolean;
  value?: T;
  fromLevel?: CacheLevel;
}
