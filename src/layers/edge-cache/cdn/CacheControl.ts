/**
 * CacheControl — HTTP freshness parsing and TTL negotiation.
 *
 * `parseCacheControl` handles the standard directive set used by CDNs:
 * max-age, s-maxage, stale-while-revalidate, stale-if-error, no-cache,
 * no-store, private, public, must-revalidate, immutable. Quoted values
 * and case-insensitive directive names are tolerated.
 *
 * `negotiateTtl` resolves the effective freshness lifetime for a
 * response: s-maxage wins for shared caches, then max-age, then the
 * Expires header, then a heuristic fraction of Last-Modified age
 * (RFC 7234 §4.2.2: 10% of time since last modification), then the
 * caller's default.
 *
 * `freshness` classifies a stored entry at lookup time: FRESH, usable
 * for stale-while-revalidate, usable for stale-if-error, or MUST
 * revalidate.
 *
 * @module EdgeCache/Cdn
 */

import { CacheControl, CacheMetadata, EdgeResponse } from './types';

const TOKEN_RE = /([a-zA-Z][a-zA-Z0-9_-]*)\s*(?:=\s*(?:"([^"]*)"|([^,\s]+)))?/g;

/** Parse a Cache-Control header value into directives (seconds). */
export function parseCacheControl(header: string | undefined): CacheControl {
  const cc: CacheControl = {
    noCache: false,
    noStore: false,
    private_: false,
    public_: false,
    mustRevalidate: false,
    immutable: false,
  };
  if (!header) return cc;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(header)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3];
    const seconds = value !== undefined ? Math.max(0, Math.floor(Number(value))) : undefined;
    switch (name) {
      case 'max-age': if (seconds !== undefined && !Number.isNaN(seconds)) cc.maxAge = seconds; break;
      case 's-maxage': if (seconds !== undefined && !Number.isNaN(seconds)) cc.sMaxAge = seconds; break;
      case 'stale-while-revalidate': if (seconds !== undefined && !Number.isNaN(seconds)) cc.staleWhileRevalidate = seconds; break;
      case 'stale-if-error': if (seconds !== undefined && !Number.isNaN(seconds)) cc.staleIfError = seconds; break;
      case 'no-cache': cc.noCache = true; break;
      case 'no-store': cc.noStore = true; break;
      case 'private': cc.private_ = true; break;
      case 'public': cc.public_ = true; break;
      case 'must-revalidate': cc.mustRevalidate = true; break;
      case 'immutable': cc.immutable = true; break;
      default: break; // extensions ignored
    }
  }
  return cc;
}

/** Parse an HTTP-date (RFC 7231 formats: IMF-fixdate, RFC 850, asctime). */
export function parseHttpDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isNaN(t) ? undefined : t;
}

/** Is this response status cacheable by default? (RFC 7231 §6.1 list.) */
const CACHEABLE_BY_DEFAULT = new Set([200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501]);

export function isStatusCacheable(status: number): boolean {
  return CACHEABLE_BY_DEFAULT.has(status);
}

/**
 * Resolve effective TTL seconds for an origin response.
 * Returns undefined when the response must not be stored.
 */
export function negotiateTtl(
  response: EdgeResponse,
  opts: { honorSMaxage: boolean; defaultTtlSeconds: number; now?: number }
): number | undefined {
  const now = opts.now ?? Date.now();
  const cc = parseCacheControl(response.headers['cache-control']);

  if (cc.noStore || cc.private_) return undefined;
  if (response.headers['set-cookie'] !== undefined && !cc.public_) return undefined;

  if (!isStatusCacheable(response.status) && cc.maxAge === undefined && cc.sMaxAge === undefined) {
    return undefined;
  }

  if (opts.honorSMaxage && cc.sMaxAge !== undefined) return cc.sMaxAge;
  if (cc.maxAge !== undefined) return cc.maxAge;

  const expires = parseHttpDate(response.headers['expires']);
  if (expires !== undefined) {
    return Math.max(0, Math.floor((expires - now) / 1000));
  }

  // Heuristic freshness: 10% of the object's age.
  const lastModified = parseHttpDate(response.headers['last-modified']);
  if (lastModified !== undefined && lastModified < now) {
    return Math.max(1, Math.floor(((now - lastModified) / 1000) * 0.1));
  }

  return opts.defaultTtlSeconds;
}

/** Freshness classification of a stored entry. */
export enum Freshness {
  /** Inside TTL; serve directly. */
  FRESH = 'fresh',
  /** Stale but inside stale-while-revalidate window. */
  STALE_SWR = 'stale_swr',
  /** Stale but inside stale-if-error window (serve only on origin error). */
  STALE_SIE = 'stale_sie',
  /** Fully stale; must revalidate or fetch. */
  EXPIRED = 'expired',
}

/** Classify a stored entry at `now`. */
export function freshness(meta: CacheMetadata, now: number): Freshness {
  if (now < meta.freshUntil) return Freshness.FRESH;
  if (meta.swrUntil !== undefined && now < meta.swrUntil) return Freshness.STALE_SWR;
  if (meta.sieUntil !== undefined && now < meta.sieUntil) return Freshness.STALE_SIE;
  return Freshness.EXPIRED;
}

/**
 * Build the conditional headers for revalidation: If-None-Match from
 * ETag (preferred) and/or If-Modified-Since from Last-Modified.
 */
export function conditionalHeaders(meta: CacheMetadata): Record<string, string> {
  const h: Record<string, string> = {};
  if (meta.validators.etag !== undefined) {
    h['if-none-match'] = meta.validators.etag;
  }
  if (meta.validators.lastModified !== undefined) {
    h['if-modified-since'] = new Date(meta.validators.lastModified).toUTCString();
  }
  return h;
}

/** Extract Vary header names from a response (excluding '*' which forbids caching). */
export function parseVary(response: EdgeResponse): { headers: string[]; wildcard: boolean } {
  const raw = response.headers['vary'];
  if (!raw) return { headers: [], wildcard: false };
  const names = raw.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
  return { headers: names.filter((n) => n !== '*'), wildcard: names.includes('*') };
}
