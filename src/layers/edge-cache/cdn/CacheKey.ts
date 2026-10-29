/**
 * CacheKey — cache-key normalization.
 *
 * Produces a canonical key from a request so that semantically-identical
 * requests share one cache entry:
 *
 *  1. Split URL into path + query.
 *  2. Path: lower-case host-dependent casing is NOT applied (paths are
 *     case-sensitive per RFC 3986); strip duplicate slashes, resolve
 *     '.' and '..' segments, drop trailing '/' except root.
 *  3. Query: parse pairs; keep blank values ('a' vs 'a=' preserved as
 *     distinct); sort by (name, value) lexicographically; drop params
 *     in an ignore-set (e.g. tracking params utm_*, gclid, fbclid).
 *  4. Vary: append the normalized values of the request headers named
 *     by the entry's Vary set (computed lazily — see VaryIndex), so
 *     "Accept-Encoding: br" vs "gzip" share or split entries correctly.
 *
 * @module EdgeCache/Cdn
 */

/** Tracking params ignored by default when normalizing. */
export const DEFAULT_IGNORED_PARAMS: ReadonlySet<string> = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'msclkid', 'dclid', 'mc_cid', 'mc_eid', '_ga', '_gl',
]);

export interface ParsedUrl {
  path: string;
  /** [name, value] pairs in original order; value '' means bare flag. */
  queryPairs: Array<[string, string]>;
  /** True if a '?' was present (distinguishes '/a' from '/a?'). */
  hasQuery: boolean;
}

/** Parse a URL into path + ordered query pairs. */
export function parseUrl(url: string): ParsedUrl {
  const q = url.indexOf('?');
  const path = q < 0 ? url : url.slice(0, q);
  const qs = q < 0 ? '' : url.slice(q + 1);
  const queryPairs: Array<[string, string]> = [];
  if (qs.length > 0) {
    for (const part of qs.split('&')) {
      if (part === '') continue;
      const eq = part.indexOf('=');
      if (eq < 0) {
        queryPairs.push([decode(part), '']);
      } else {
        queryPairs.push([decode(part.slice(0, eq)), decode(part.slice(eq + 1))]);
      }
    }
  }
  return { path: normalizePath(path), queryPairs, hasQuery: q >= 0 };
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // leave malformed escapes verbatim
  }
}

/** Resolve dot segments and collapse duplicate slashes. */
export function normalizePath(path: string): string {
  const segments = path.split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') {
      // preserve leading empty (absolute path) via first iteration handling
      if (out.length === 0 && segments[0] === '') {
        out.push('');
      }
      continue;
    }
    if (seg === '..') {
      if (out.length > 1 || (out.length === 1 && out[0] !== '')) {
        out.pop();
      }
      continue;
    }
    out.push(seg);
  }
  let result = out.join('/');
  if (result === '') result = '/';
  // strip trailing slash (except root)
  if (result.length > 1 && result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

/**
 * Base cache key: normalized path + sorted, filtered query.
 * Vary headers are folded in separately by `varyKey`.
 */
export function baseKey(url: string, ignoredParams: ReadonlySet<string> = DEFAULT_IGNORED_PARAMS): string {
  const { path, queryPairs } = parseUrl(url);
  const kept = queryPairs
    .filter(([name]) => !ignoredParams.has(name.toLowerCase()))
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const qs = kept
    .map(([n, v]) => (v === '' ? encodeURIComponent(n) : `${encodeURIComponent(n)}=${encodeURIComponent(v)}`))
    .join('&');
  return qs.length > 0 ? `${path}?${qs}` : path;
}

/**
 * Vary suffix for a request: normalized values of the named headers.
 * Multi-valued headers (e.g. accept-encoding lists) are normalized:
 * trimmed, lower-cased, sorted, deduped.
 */
export function varyKey(varyHeaders: string[], requestHeaders: Record<string, string>): string {
  if (varyHeaders.length === 0) return '';
  const parts: string[] = [];
  for (const h of [...varyHeaders].sort()) {
    const raw = requestHeaders[h.toLowerCase()] ?? '';
    const norm = raw
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.length > 0)
      .sort()
      .join(',');
    parts.push(`${h.toLowerCase()}=${norm}`);
  }
  return '|' + parts.join('|');
}

/** Full key for a request given a Vary set discovered at store time. */
export function fullKey(
  url: string,
  varyHeaders: string[],
  requestHeaders: Record<string, string>,
  ignoredParams?: ReadonlySet<string>
): string {
  return baseKey(url, ignoredParams) + varyKey(varyHeaders, requestHeaders);
}
