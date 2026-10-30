/**
 * CacheControl — Cache-Control header parsing and TTL computation.
 *
 * `parse` handles the real-world grammar: comma-separated directives,
 * `name`, `name=value`, `name="quoted value"`, whitespace, and
 * extension directives it doesn't know (kept for round-tripping).
 *
 * `computeTtl` implements CDN-side freshness in precedence order:
 *   1. `no-store` / `private`     → not cacheable (TTL 0, BYPASS)
 *   2. `s-maxage`                 → shared-cache TTL (overrides max-age)
 *   3. `max-age`                  → client+shared TTL
 *   4. `Expires` header           → fallback when no delta-seconds given
 *   5. nothing                    → heuristic TTL (10% of age since
 *                                   Last-Modified, capped) or default
 *
 * All clock reads go through `IClock` for testability.
 *
 * @module CdnIntegration/Engines
 */

import { CacheDirectives, CacheStatus, IClock, ParsedCacheStatus, SystemClock } from './types';

/** A TTL decision. */
export interface TtlDecision {
  /** Seconds the object may be served fresh, or 0 if not cacheable. */
  ttlSeconds: number;
  /** Why this TTL was chosen (e.g. 's-maxage', 'heuristic', 'no-store'). */
  reason: string;
  /** stale-while-revalidate window in seconds, if declared. */
  staleWhileRevalidate?: number;
  /** stale-if-error window in seconds, if declared. */
  staleIfError?: number;
  /** Cacheability verdict. */
  cacheable: boolean;
}

export class CacheControl {
  private readonly _clock: IClock;

  constructor(clock: IClock = new SystemClock()) {
    this._clock = clock;
  }

  /**
   * Parse a `Cache-Control` header value. Unknown directives go into
   * `extensions`. Malformed `name=value` pairs where value isn't a
   * non-negative integer are treated as flag directives.
   */
  static parse(header: string | undefined | null): CacheDirectives {
    const out: CacheDirectives = {
      noStore: false,
      noCache: false,
      private: false,
      public: false,
      mustRevalidate: false,
      immutable: false,
      extensions: {},
    };
    if (!header) return out;

    for (const raw of header.split(',')) {
      const part = raw.trim();
      if (part === '') continue;
      const eq = part.indexOf('=');
      const name = (eq === -1 ? part : part.slice(0, eq)).trim().toLowerCase();
      const rawVal = eq === -1 ? true : stripQuotes(part.slice(eq + 1).trim());
      const num = typeof rawVal === 'string' ? Number(rawVal) : NaN;
      const hasNum = typeof rawVal === 'string' && rawVal !== '' && Number.isFinite(num) && num >= 0;

      switch (name) {
        case 'no-store': out.noStore = true; break;
        case 'no-cache': out.noCache = true; break;
        case 'private': out.private = true; break;
        case 'public': out.public = true; break;
        case 'must-revalidate': out.mustRevalidate = true; break;
        case 'immutable': out.immutable = true; break;
        case 'max-age': if (hasNum) out.maxAge = num; break;
        case 's-maxage': if (hasNum) out.sMaxAge = num; break;
        case 'stale-while-revalidate': if (hasNum) out.staleWhileRevalidate = num; break;
        case 'stale-if-error': if (hasNum) out.staleIfError = num; break;
        default: out.extensions[name] = rawVal; break;
      }
    }
    return out;
  }

  /**
   * Compute the TTL for a response. `headers` should contain lowercase
   * header names; only `cache-control`, `expires`, `last-modified`,
   * `age`, `date` are read.
   *
   * `defaultTtlSeconds` is used when the response gives no explicit
   * freshness info (the "origin didn't say, CDN chooses" case).
   */
  computeTtl(headers: Record<string, string>, defaultTtlSeconds = 300): TtlDecision {
    const cc = CacheControl.parse(headers['cache-control']);
    const now = this._clock.now();

    if (cc.noStore || cc.private) {
      return { ttlSeconds: 0, reason: cc.noStore ? 'no-store' : 'private', cacheable: false };
    }

    // no-cache: cacheable but must revalidate before each use ⇒ TTL 0
    // but still "cacheable" in the storable sense.
    if (cc.noCache) {
      return { ttlSeconds: 0, reason: 'no-cache (revalidate)', cacheable: true };
    }

    // s-maxage wins for shared caches.
    if (cc.sMaxAge !== undefined) {
      return {
        ttlSeconds: cc.sMaxAge,
        reason: 's-maxage',
        ...(cc.staleWhileRevalidate !== undefined
          ? { staleWhileRevalidate: cc.staleWhileRevalidate }
          : {}),
        ...(cc.staleIfError !== undefined ? { staleIfError: cc.staleIfError } : {}),
        cacheable: true,
      };
    }

    if (cc.maxAge !== undefined) {
      return {
        ttlSeconds: cc.maxAge,
        reason: 'max-age',
        ...(cc.staleWhileRevalidate !== undefined
          ? { staleWhileRevalidate: cc.staleWhileRevalidate }
          : {}),
        ...(cc.staleIfError !== undefined ? { staleIfError: cc.staleIfError } : {}),
        cacheable: true,
      };
    }

    // Expires header fallback (absolute date).
    if (headers['expires'] !== undefined) {
      const exp = Date.parse(headers['expires']);
      if (Number.isFinite(exp)) {
        const date = headers['date'] !== undefined ? Date.parse(headers['date']) : now;
        const secs = Math.max(0, Math.round((exp - (Number.isFinite(date) ? date : now)) / 1000));
        return { ttlSeconds: secs, reason: 'expires', cacheable: secs > 0 };
      }
    }

    // Heuristic: 10% of the time since Last-Modified (RFC 7234 §4.2.2),
    // bounded by the default.
    if (headers['last-modified'] !== undefined) {
      const lm = Date.parse(headers['last-modified']);
      if (Number.isFinite(lm) && lm <= now) {
        const heuristic = Math.min(defaultTtlSeconds, Math.round((now - lm) / 10 / 1000));
        if (heuristic > 0) {
          return { ttlSeconds: heuristic, reason: 'heuristic (10% of age)', cacheable: true };
        }
      }
    }

    return { ttlSeconds: defaultTtlSeconds, reason: 'default', cacheable: true };
  }

  /**
   * Parse cache status from response headers. Checks CDN-specific
   * indicators in order, then falls back to Age/Expires/Cache-Control
   * arithmetic — the "status when the CDN didn't say" path.
   */
  parseStatus(headers: Record<string, string>): ParsedCacheStatus {
    // Cloudflare
    const cf = headers['cf-cache-status'];
    if (cf !== undefined) {
      const v = cf.trim().toUpperCase();
      const map: Record<string, CacheStatus> = {
        HIT: CacheStatus.Hit,
        MISS: CacheStatus.Miss,
        STALE: CacheStatus.Stale,
        EXPIRED: CacheStatus.Expired,
        REVALIDATED: CacheStatus.Stale,
        BYPASS: CacheStatus.Bypass,
        DYNAMIC: CacheStatus.Dynamic,
        UPDATING: CacheStatus.Stale,
      };
      return {
        status: map[v] ?? CacheStatus.Unknown,
        source: 'CF-Cache-Status',
        raw: cf,
      };
    }

    // Generic X-Cache / X-Cache-Status / X-CDN-Cache (Fastly/CloudFront-ish)
    for (const h of ['x-cache-status', 'x-cache', 'x-cdn-cache', 'server-timing']) {
      const raw = headers[h];
      if (raw === undefined) continue;
      const v = raw.trim().toUpperCase();
      if (/\bHIT\b/.test(v)) return { status: CacheStatus.Hit, source: h, raw };
      if (/\bSTALE\b|REVALIDAT/.test(v)) return { status: CacheStatus.Stale, source: h, raw };
      if (/\bEXPIRED\b/.test(v)) return { status: CacheStatus.Expired, source: h, raw };
      if (/\bBYPASS\b/.test(v)) return { status: CacheStatus.Bypass, source: h, raw };
      if (/\bDYNAMIC\b/.test(v)) return { status: CacheStatus.Dynamic, source: h, raw };
      if (/\bMISS\b/.test(v)) return { status: CacheStatus.Miss, source: h, raw };
    }

    // Heuristic: no explicit status header.
    const cc = CacheControl.parse(headers['cache-control']);
    if (cc.noStore || cc.private) {
      return { status: CacheStatus.Bypass, source: 'Cache-Control' };
    }
    const age = headers['age'] !== undefined ? Number(headers['age']) : undefined;
    if (age !== undefined && Number.isFinite(age)) {
      const ttl = this.computeTtl(headers);
      if (!ttl.cacheable) return { status: CacheStatus.Dynamic, source: 'Age' };
      const swr = ttl.staleWhileRevalidate ?? 0;
      if (age <= ttl.ttlSeconds) {
        return { status: CacheStatus.Hit, source: 'Age', ageSeconds: age };
      }
      if (age <= ttl.ttlSeconds + swr) {
        return { status: CacheStatus.Stale, source: 'Age', ageSeconds: age };
      }
      return { status: CacheStatus.Expired, source: 'Age', ageSeconds: age };
    }
    if (cc.maxAge === undefined && cc.sMaxAge === undefined) {
      return { status: CacheStatus.Dynamic, source: 'headers' };
    }
    return { status: CacheStatus.Unknown, source: 'headers' };
  }
}

function stripQuotes(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}
