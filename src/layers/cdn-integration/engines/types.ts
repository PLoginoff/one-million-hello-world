/**
 * CDN Integration Engine — Core Types
 *
 * Vocabulary shared across the CDN engines:
 *   - `IClock`             — injectable clock (TTL math, signing, rate limits)
 *   - `CacheStatus`        — parsed HIT/MISS/STALE/EXPIRED/BYPASS/DYNAMIC
 *   - `CacheDirective`     — parsed Cache-Control value
 *   - `PurgeRequest`       — one invalidation (url / tag / prefix / wildcard)
 *   - `CdnProvider`        — a provider profile for multi-CDN routing
 *   - `RateLimitPolicy`    — token-bucket parameters
 *
 * @module CdnIntegration/Engines
 */

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

export class TestClock implements IClock {
  private _t: number;
  constructor(start = 0) {
    this._t = start;
  }
  now(): number {
    return this._t;
  }
  advance(ms: number): void {
    this._t += ms;
  }
  set(ms: number): void {
    this._t = ms;
  }
}

// ---------------------------------------------------------------------------
// Cache status (parsed from response headers)
// ---------------------------------------------------------------------------

/**
 * Normalized cache disposition. Derived from `X-Cache`,
 * `CF-Cache-Status`, `X-Cache-Status`, `Age`/`Expires`/`Cache-Control`
 * headers — the raw values differ per CDN but collapse to this enum.
 */
export enum CacheStatus {
  Hit = 'HIT',
  Miss = 'MISS',
  /** Served stale within the stale-while-revalidate window. */
  Stale = 'STALE',
  /** Freshness lifetime elapsed; not served. */
  Expired = 'EXPIRED',
  /** Cache-Control forbade storing (no-store/private). */
  Bypass = 'BYPASS',
  /** Not cacheable (dynamic content, no headers). */
  Dynamic = 'DYNAMIC',
  /** Couldn't determine. */
  Unknown = 'UNKNOWN',
}

/** Structured parse result. */
export interface ParsedCacheStatus {
  status: CacheStatus;
  /** Which header produced the verdict, e.g. 'X-Cache'. */
  source: string;
  /** Age in seconds when reported, if the header provided one. */
  ageSeconds?: number;
  /** Raw header value, for debugging. */
  raw?: string;
}

// ---------------------------------------------------------------------------
// Cache-Control directives
// ---------------------------------------------------------------------------

/**
 * A parsed Cache-Control header — both the boolean flags and the
 * numeric seconds values needed to compute a TTL.
 */
export interface CacheDirectives {
  maxAge?: number;
  sMaxAge?: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  noStore: boolean;
  noCache: boolean;
  private: boolean;
  public: boolean;
  mustRevalidate: boolean;
  immutable: boolean;
  /** Directives we didn't understand, kept for round-trip debugging. */
  extensions: Record<string, string | true>;
}

// ---------------------------------------------------------------------------
// Purge / invalidation
// ---------------------------------------------------------------------------

export enum PurgeKind {
  Url = 'url',
  Tag = 'tag',
  Prefix = 'prefix',
  Wildcard = 'wildcard',
  All = 'all',
}

/** One invalidation request. */
export interface PurgeRequest {
  kind: PurgeKind;
  /**
   * - url:      exact URL to invalidate (normalized before matching)
   * - tag:      surrogate-key tag (`Cache-Tag`/`Surrogate-Key`)
   * - prefix:   path prefix (`/static/`)
   * - wildcard: glob with `*` (`/img/*.png`)
   * - all:      value ignored
   */
  value: string;
}

/** Outcome for a single purge request. */
export interface PurgeResult {
  request: PurgeRequest;
  /** Provider-side receipt id (synthetic here). */
  purgeId: string;
  /** 'accepted' | 'rate_limited' | 'duplicate' | 'invalid'. */
  status: 'accepted' | 'rate_limited' | 'duplicate' | 'invalid';
  /** Estimated propagation window ms, or undefined if unknown. */
  etaMs?: number;
  /** Detail message for non-accepted results. */
  message?: string;
}

/** Token-bucket rate limit configuration. */
export interface RateLimitPolicy {
  /** Tokens added per second. */
  refillRatePerSec: number;
  /** Bucket capacity (burst allowance). */
  burst: number;
}

// ---------------------------------------------------------------------------
// Signed URLs
// ---------------------------------------------------------------------------

/** Options baked into a signed URL. */
export interface SignedUrlOptions {
  /** Epoch ms expiry. Required. */
  expires: number;
  /** Restrict to a client IP (exact match). */
  ip?: string;
  /** Restrict to HTTP method (`GET`). */
  method?: string;
}

/** Verification outcome. */
export interface SignedUrlVerify {
  ok: boolean;
  reason?: 'expired' | 'bad_signature' | 'ip_mismatch' | 'method_mismatch' | 'malformed';
}

// ---------------------------------------------------------------------------
// Multi-CDN routing
// ---------------------------------------------------------------------------

/** A provider profile for weighted routing. */
export interface CdnProvider {
  name: string;
  /** Relative weight for weighted selection (>=0). */
  weight: number;
  /** Regions this provider is strong in (ISO codes); empty = global. */
  regions: string[];
  /** Whether the provider is healthy — unhealthy providers get 0 traffic. */
  healthy: boolean;
  /** Reported hit ratio 0..1 used as a soft signal by the router. */
  hitRatio?: number;
}

/** A routing decision. */
export interface RoutingDecision {
  provider: string;
  reason: string;
}
