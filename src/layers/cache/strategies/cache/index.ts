/**
 * Cache Strategies
 *
 * Exports all cache strategy implementations.
 *
 * @module CacheLayer/Strategies
 */

export type {
  ICacheStrategy,
  IMultiLevelCacheStrategy,
  CacheStrategyConfig,
  CacheGetResult,
  CacheSetResult,
} from './ICacheStrategy';
export { LRUCacheStrategy } from './LRUCacheStrategy';
export { LFUCacheStrategy } from './LFUCacheStrategy';
export { TTLCacheStrategy } from './TTLCacheStrategy';
export { TwoTierCacheStrategy } from './TwoTierCacheStrategy';
export type { TwoTierCacheConfig } from './TwoTierCacheStrategy';
export { FIFOCacheStrategy } from './FIFOCacheStrategy';
export { RandomCacheStrategy } from './RandomCacheStrategy';
export { SegmentedCacheStrategy } from './SegmentedCacheStrategy';
export type { SegmentConfig, SegmentedCacheConfig } from './SegmentedCacheStrategy';
