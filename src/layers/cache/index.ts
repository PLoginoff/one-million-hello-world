/**
 * Cache Layer
 * 
 * This module exports all public interfaces, implementations, and types
 * for the Cache Layer (Layer 12 of the 25-layer architecture).
 * 
 * The Cache Layer provides multi-level caching
 * and invalidation strategies.
 * 
 * @module CacheLayer
 */

export { ICacheManager } from './interfaces/ICacheManager';
export { CacheManager } from './implementations/CacheManager';
export * from './types/cache-types';
