/**
 * IntrospectionClient — RFC 7662 token introspection with result caching.
 *
 * Sends `POST /introspect` shaped requests through a pluggable
 * `IntrospectionTransport` and interprets the response:
 *
 *  - `active: false` short-circuits everything.
 *  - Active responses are cached for `min(response.exp - now, cacheTtlMs)`
 *    — never past the token's own expiry, so a cached "active" can't
 *    outlive the token itself.
 *  - Negative results (inactive/error) are cached for `negativeTtlMs`
 *    to absorb retry storms on revoked tokens.
 *
 * The client also normalizes the response into `TokenClaims2` fields so
 * it composes with ScopeAuthorizer and TokenBinding.
 *
 * @module JwtValidationLayer/Engine2
 */

import { JwtClock2, SystemJwtClock2, TokenClaims2 } from './types';

export interface IntrospectionRequest2 {
  readonly token: string;
  readonly token_type_hint?: 'access_token' | 'refresh_token';
}

export interface IntrospectionResult2 {
  readonly active: boolean;
  readonly scope?: string;
  readonly client_id?: string;
  readonly sub?: string;
  readonly aud?: string;
  readonly iss?: string;
  readonly exp?: number;
  readonly iat?: number;
  readonly jti?: string;
  readonly token_type?: string;
  readonly cnf?: TokenClaims2['cnf'];
  readonly [k: string]: unknown;
}

/** Transport for the introspection POST. Stub in tests. */
export interface IntrospectionTransport {
  post(req: IntrospectionRequest2): Promise<IntrospectionResult2>;
}

export class IntrospectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntrospectionError';
  }
}

export interface IntrospectionClientOptions {
  /** Max cache time for active results in ms. Default 60_000. */
  cacheTtlMs?: number;
  /** Cache time for inactive/error results in ms. Default 5_000. */
  negativeTtlMs?: number;
  /** Max cached entries (FIFO eviction). Default 1024. */
  maxCacheEntries?: number;
  clock?: JwtClock2;
}

interface CacheEntry {
  result: IntrospectionResult2;
  expiresAtMs: number;
}

export class IntrospectionClient {
  private readonly _transport: IntrospectionTransport;
  private readonly _ttlMs: number;
  private readonly _negTtlMs: number;
  private readonly _maxEntries: number;
  private readonly _clock: JwtClock2;
  private readonly _cache = new Map<string, CacheEntry>();
  private _calls = 0;
  private _cacheHits = 0;

  constructor(transport: IntrospectionTransport, opts: IntrospectionClientOptions = {}) {
    this._transport = transport;
    this._ttlMs = Math.max(1, opts.cacheTtlMs ?? 60_000);
    this._negTtlMs = Math.max(0, opts.negativeTtlMs ?? 5_000);
    this._maxEntries = Math.max(1, opts.maxCacheEntries ?? 1024);
    this._clock = opts.clock ?? new SystemJwtClock2();
  }

  /**
   * Introspect a token. Cached results are served until their computed
   * expiry — active entries never outlive the token's `exp`.
   */
  async introspect(token: string, hint?: 'access_token' | 'refresh_token'): Promise<IntrospectionResult2> {
    const now = this._clock.now();
    const cached = this._cache.get(token);
    if (cached && now < cached.expiresAtMs) {
      this._cacheHits++;
      return cached.result;
    }

    this._calls++;
    let result: IntrospectionResult2;
    try {
      result = await this._transport.post({ token, token_type_hint: hint });
    } catch (err) {
      throw err instanceof IntrospectionError ? err : new IntrospectionError(String(err));
    }

    // Compute cache expiry: active → min(ttl, exp); inactive → negative ttl.
    let ttl = result.active ? this._ttlMs : this._negTtlMs;
    if (result.active && typeof result.exp === 'number') {
      const tokenTtl = result.exp * 1000 - now;
      ttl = Math.max(0, Math.min(ttl, tokenTtl));
    }
    if (ttl > 0) {
      if (this._cache.size >= this._maxEntries) {
        // FIFO evict the oldest inserted entry.
        const oldest = this._cache.keys().next().value;
        if (oldest !== undefined) this._cache.delete(oldest);
      }
      this._cache.set(token, { result, expiresAtMs: now + ttl });
    }
    return result;
  }

  /** Is the token active per the freshest cached/remote answer? */
  async isActive(token: string): Promise<boolean> {
    return (await this.introspect(token)).active;
  }

  invalidate(token: string): boolean {
    return this._cache.delete(token);
  }

  /** Drop expired entries. */
  sweep(): number {
    const now = this._clock.now();
    let n = 0;
    for (const [k, v] of this._cache) {
      if (now >= v.expiresAtMs) {
        this._cache.delete(k);
        n++;
      }
    }
    return n;
  }

  get stats(): { calls: number; cacheHits: number; cached: number } {
    return { calls: this._calls, cacheHits: this._cacheHits, cached: this._cache.size };
  }
}
