/**
 * CDN Integration Engines — public surface.
 *
 * Purge API with dedup + rate limits, normalized cache keys, HMAC
 * signed URLs, origin shielding with request collapsing, cache-status
 * parsing, Cache-Control TTL computation, invalidation batching, and
 * weighted multi-CDN routing.
 */

export {
  CacheStatus,
  PurgeKind,
  SystemClock,
  TestClock,
} from './types';
export type {
  IClock,
  ParsedCacheStatus,
  CacheDirectives,
  PurgeRequest,
  PurgeResult,
  RateLimitPolicy,
  SignedUrlOptions,
  SignedUrlVerify,
  CdnProvider,
  RoutingDecision,
} from './types';

export { CacheKeyGenerator, normalizePath } from './CacheKey';
export type { CacheKey, CacheKeyOptions } from './CacheKey';

export { CacheControl } from './CacheControl';
export type { TtlDecision } from './CacheControl';

export { SignedUrl } from './SignedUrl';

export { TokenBucket } from './RateLimiter';

export { PurgeEngine, wildcardToRegex } from './PurgeEngine';
export type { PurgeEngineOptions } from './PurgeEngine';

export { OriginShield } from './OriginShield';
export type { ShieldPop, ShieldDecision } from './OriginShield';

export { InvalidationBatcher } from './InvalidationBatcher';
export type { BatcherOptions } from './InvalidationBatcher';

export { CdnRouter, fnv1a } from './CdnRouter';
export type { RouterOptions } from './CdnRouter';
