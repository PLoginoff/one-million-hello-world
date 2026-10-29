/**
 * Edge-Cache CDN — real CDN-like caching engine.
 */

export {
  CacheDisposition,
  EdgeCacheErrorCode,
  CdnCacheError,
  DEFAULT_EDGE_CONFIG,
} from './types';
export type {
  EdgeRequest,
  EdgeResponse,
  CacheControl,
  Validators,
  CacheMetadata,
  CacheObject,
  CacheFetchResult,
  PurgeSelector,
  RegionStats,
  OriginFetcher,
  EdgeCacheEngineConfig,
} from './types';

export { parseUrl, normalizePath, baseKey, varyKey, fullKey, DEFAULT_IGNORED_PARAMS } from './CacheKey';
export { parseCacheControl, parseHttpDate, isStatusCacheable, negotiateTtl, freshness, conditionalHeaders, parseVary, Freshness } from './CacheControl';
export { EdgeCacheEngine } from './EdgeCacheEngine';
export { OriginShield } from './OriginShield';
export type { ShieldStats, ShieldConfig } from './OriginShield';
export { CacheWarmer } from './CacheWarmer';
export type { WarmItem, WarmResult, WarmSummary } from './CacheWarmer';
export { SignedUrl } from './SignedUrl';
export type { SignedUrlPolicy, VerifyResult } from './SignedUrl';
