/**
 * Edge-Cache CDN Types
 *
 * Shared types for the CDN-like edge cache: request/response models,
 * cache metadata (validators, TTL resolution), purge selectors, and
 * per-region statistics.
 *
 * @module EdgeCache/Cdn
 */

/** Simulated HTTP request at the edge. */
export interface EdgeRequest {
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE';
  /** Path + query string, e.g. "/a/b?x=1&y=2". */
  url: string;
  /** Request headers, lower-cased keys. */
  headers: Record<string, string>;
  /** Region the request landed in (PoP). */
  region?: string;
}

/** Simulated origin/edge HTTP response. */
export interface EdgeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** A parsed Cache-Control header (response or request directives). */
export interface CacheControl {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  noCache: boolean;
  noStore: boolean;
  private_: boolean;
  public_: boolean;
  mustRevalidate: boolean;
  immutable: boolean;
}

/** Validators stored with a cached object. */
export interface Validators {
  etag?: string;
  lastModified?: number;
}

/** Cached entry metadata. */
export interface CacheMetadata {
  /** Seconds the entry is fresh (relative to storedAt). */
  ttlSeconds: number;
  /** Epoch ms when stored. */
  storedAt: number;
  /** Epoch ms when freshness expires. */
  freshUntil: number;
  /** SWR window end (freshUntil + swr). */
  swrUntil?: number;
  /** Stale-if-error window end. */
  sieUntil?: number;
  validators: Validators;
  /** Header names that vary (from origin Vary). */
  vary: string[];
  /** Purge tags attached at store time. */
  tags: string[];
  /** Origin status that was cached (for negative caching). */
  originStatus: number;
}

/** A stored cache object. */
export interface CacheObject {
  key: string;
  response: EdgeResponse;
  metadata: CacheMetadata;
  hits: number;
}

/** How a lookup was satisfied. */
export enum CacheDisposition {
  HIT = 'hit',
  /** Served stale inside the SWR window; revalidation queued. */
  STALE_REVALIDATE = 'stale_while_revalidate',
  /** Served stale because origin errored, within stale-if-error. */
  STALE_IF_ERROR = 'stale_if_error',
  /** Went to origin and cached the response. */
  MISS = 'miss',
  /** Went to origin; response not cacheable. */
  BYPASS = 'bypass',
  /** Conditional revalidation returned 304; TTL extended. */
  REVALIDATED = 'revalidated',
}

/** Result of a `fetch` through the edge cache. */
export interface CacheFetchResult {
  response: EdgeResponse;
  disposition: CacheDisposition;
  /** Present when served from cache. */
  age?: number;
  /** True when a conditional request got a 304. */
  revalidated304?: boolean;
}

/** Purge selector. */
export type PurgeSelector =
  | { kind: 'key'; key: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'prefix'; prefix: string }
  | { kind: 'all' };

/** Per-region rolling statistics. */
export interface RegionStats {
  hits: number;
  misses: number;
  staleServed: number;
  revalidations: number;
  revalidated304: number;
  purges: number;
  /** Requests coalesced onto an in-flight origin fetch. */
  coalesced: number;
  bytes: number;
}

/** Origin fetcher injected by the caller/test. */
export type OriginFetcher = (req: EdgeRequest) => Promise<EdgeResponse>;

/** Engine configuration. */
export interface EdgeCacheEngineConfig {
  /** Default TTL seconds when origin sends no freshness headers. */
  defaultTtlSeconds: number;
  /** Honor s-maxage over max-age (shared cache semantics). */
  honorSMaxage: boolean;
  /** Cache negative responses (404/410/500) for this many seconds; 0 disables. */
  negativeTtlSeconds: number;
  /** Max entries; LRU eviction beyond. */
  capacity: number;
  /** Request-coalescing: identical in-flight keys share one origin fetch. */
  coalesceRequests: boolean;
  /** Regions to track; stats recorded under 'default' when request omits region. */
  regions: string[];
}

export const DEFAULT_EDGE_CONFIG: EdgeCacheEngineConfig = {
  defaultTtlSeconds: 60,
  honorSMaxage: true,
  negativeTtlSeconds: 10,
  capacity: 10_000,
  coalesceRequests: true,
  regions: ['default'],
};

/** Error codes. */
export enum EdgeCacheErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  ORIGIN_ERROR = 'ORIGIN_ERROR',
}

export class CdnCacheError extends Error {
  readonly code: EdgeCacheErrorCode;
  constructor(code: EdgeCacheErrorCode, message: string) {
    super(message);
    this.name = 'CdnCacheError';
    this.code = code;
  }
}
