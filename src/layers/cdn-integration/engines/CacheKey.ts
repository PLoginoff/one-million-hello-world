/**
 * CacheKey — normalized cache-key generation.
 *
 * Two URLs that serve the same bytes must produce the same key. The
 * normalizer applies the canonicalization rules real CDNs use:
 *
 *   - scheme + host lowercased; default ports (`:80`/`:443`) dropped
 *   - path: `.`/`..` segments resolved, `//` collapsed, trailing `/`
 *     kept (it IS significant — `/a/` ≠ `/a`)
 *   - query params: sorted by name, blank values kept, tracking
 *     parameters (`utm_*`, `fbclid`, `gclid`, `_`) stripped by default
 *   - fragment dropped (never sent to origin anyway)
 *   - configurable vary-on headers (`Accept-Encoding`, `Accept-Language`)
 *     folded into the key so variants cache separately
 *
 * @module CdnIntegration/Engines
 */

/** Normalization options. */
export interface CacheKeyOptions {
  /**
   * Query params that should NOT affect the key (case-insensitive).
   * Defaults to common trackers. Pass `[]` to keep everything.
   */
  ignoredParams?: string[];
  /** Keep only these params (allowlist); applied before ignoredParams. */
  allowedParams?: string[];
  /** Header names that vary the key (e.g. 'accept-encoding'). */
  varyHeaders?: string[];
  /**
   * Sort query params (default true). Disable only if the origin
   * treats param order as significant.
   */
  sortParams?: boolean;
  /** Strip default port (default true). */
  stripDefaultPort?: boolean;
}

const DEFAULT_IGNORED = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'mc_cid',
  'mc_eid', '_ga', '_gl', 'igshid', 'ref', 'source',
]);

/** A normalized key plus the components it was built from. */
export interface CacheKey {
  key: string;
  host: string;
  path: string;
  /** Sorted surviving params (name, value). */
  params: Array<[string, string]>;
  /** Surviving vary-header values folded into the key. */
  vary: Array<[string, string]>;
}

export class CacheKeyGenerator {
  private readonly _opts: Required<Pick<CacheKeyOptions, 'sortParams' | 'stripDefaultPort'>> &
    CacheKeyOptions;
  private readonly _ignored: Set<string>;
  private readonly _allowed: Set<string> | null;

  constructor(options: CacheKeyOptions = {}) {
    this._opts = {
      sortParams: options.sortParams ?? true,
      stripDefaultPort: options.stripDefaultPort ?? true,
      ...options,
    };
    this._ignored = new Set(
      (options.ignoredParams ?? [...DEFAULT_IGNORED]).map((p) => p.toLowerCase())
    );
    this._allowed =
      options.allowedParams === undefined
        ? null
        : new Set(options.allowedParams.map((p) => p.toLowerCase()));
  }

  /**
   * Normalize a URL into a cache key. `headers` supplies the values for
   * configured vary headers (keys should be lowercase names).
   */
  generate(url: string, headers: Record<string, string> = {}): CacheKey {
    const u = new URL(url);

    // Host + port
    let host = u.hostname.toLowerCase();
    if (!this._opts.stripDefaultPort && u.port !== '') {
      host += `:${u.port}`;
    } else if (this._opts.stripDefaultPort && u.port !== '' && !isDefaultPort(u.protocol, u.port)) {
      host += `:${u.port}`;
    }

    // Path — resolve dot segments and collapse slashes.
    const path = normalizePath(u.pathname);

    // Query — filter then optionally sort.
    let params: Array<[string, string]> = [];
    for (const [k, v] of u.searchParams.entries()) {
      const lk = k.toLowerCase();
      if (this._allowed !== null && !this._allowed.has(lk)) continue;
      if (this._ignored.has(lk)) continue;
      params.push([k, v]);
    }
    if (this._opts.sortParams) {
      params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
    }

    // Vary headers — canonicalize value (lowercase, trim).
    const vary: Array<[string, string]> = [];
    for (const h of this._opts.varyHeaders ?? []) {
      const v = headers[h.toLowerCase()] ?? headers[h];
      if (v !== undefined) {
        vary.push([h.toLowerCase(), v.trim().toLowerCase()]);
      }
    }
    vary.sort((a, b) => (a[0] < b[0] ? -1 : 1));

    // Render.
    const qs = params.map(([k, v]) => `${k}=${v}`).join('&');
    const vs = vary.map(([k, v]) => `${k}=${v}`).join(';');
    const key = `${u.protocol.toLowerCase()}//${host}${path}${qs ? `?${qs}` : ''}${vs ? `#vary:${vs}` : ''}`;
    return { key, host, path, params, vary };
  }

  /** Convenience: only the key string. */
  key(url: string, headers: Record<string, string> = {}): string {
    return this.generate(url, headers).key;
  }
}

function isDefaultPort(protocol: string, port: string): boolean {
  return (protocol === 'http:' && port === '80') || (protocol === 'https:' && port === '443');
}

/**
 * Resolve `.`/`..` segments and collapse `//` per RFC 3986 §5.2.4,
 * preserving a trailing slash. Operates on the raw path string.
 */
export function normalizePath(pathname: string): string {
  if (pathname === '') return '/';
  const trailing = pathname.endsWith('/');
  const out: string[] = [];
  for (const seg of pathname.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  let p = '/' + out.join('/');
  if (trailing && p !== '/') p += '/';
  return p;
}
