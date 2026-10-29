/**
 * API Versioning — Request Version Extraction
 *
 * Strategies for pulling the client's requested API version out of an
 * HTTP-ish request abstraction. Tried in order; first confident match wins.
 *
 * Supported strategies (matching real-world API conventions):
 *
 *   1. Header      — `X-API-Version: 2` or `API-Version: 1.2.3`
 *   2. URL path    — `/v2/users`, `/api/v1.2/orders` (segment-level `vN[.N[.N]]`)
 *   3. Query       — `?version=2` or `?api-version=2`
 *   4. Media type  — `Accept: application/vnd.acme.v2+json` /
 *                    `Accept: application/json; version=2`
 *
 * The Request abstraction is deliberately minimal so the same extractors
 * work over Express, raw Node, or test doubles.
 *
 * @module ApiVersioning/Negotiation
 */

/** Minimal request shape — adapters map their framework onto this. */
export interface VersionedRequest {
  readonly method?: string;
  /** Request path WITHOUT query string (`/api/v2/users`). */
  readonly path: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly query?: Readonly<Record<string, string | string[] | undefined>>;
}

export interface ExtractionResult {
  /** Raw version token as sent by the client (`v2`, `1.2.3`, `2`). */
  readonly raw: string;
  /** Normalized form (`2`, `1.2.3`) — leading `v` stripped. */
  readonly version: string;
  /** Which strategy found it. */
  readonly source: 'header' | 'path' | 'query' | 'media-type';
}

export interface VersionExtractor {
  readonly name: string;
  extract(req: VersionedRequest): ExtractionResult | undefined;
}

function firstHeader(headers: VersionedRequest['headers'], name: string): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function firstQuery(query: VersionedRequest['query'], name: string): string | undefined {
  if (!query) return undefined;
  const v = query[name];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/** Normalize a version token: strip leading `v`, trim. */
export function normalizeVersionToken(raw: string): string {
  return raw.trim().replace(/^v/i, '');
}

/** `X-API-Version` / `API-Version` headers. */
export class HeaderVersionExtractor implements VersionExtractor {
  readonly name = 'header';
  private readonly _headerNames: ReadonlyArray<string>;

  constructor(headerNames: ReadonlyArray<string> = ['x-api-version', 'api-version']) {
    this._headerNames = headerNames;
  }

  extract(req: VersionedRequest): ExtractionResult | undefined {
    for (const n of this._headerNames) {
      const v = firstHeader(req.headers, n);
      if (v !== undefined && v.trim() !== '') {
        return { raw: v.trim(), version: normalizeVersionToken(v), source: 'header' };
      }
    }
    return undefined;
  }
}

/**
 * URL path segment `/v{major}[.{minor}[.{patch}]]`. Only matches a
 * *dedicated* version segment — `/v2/users` yes, `/users/v2beta-ish` no,
 * `/version2/` no (must start with `v` followed by a digit).
 */
export class UrlPathVersionExtractor implements VersionExtractor {
  readonly name = 'path';
  private readonly _pattern: RegExp;

  constructor(pattern?: RegExp) {
    this._pattern = pattern ?? /\/v(\d+(?:\.\d+){0,2})(?:\/|$)/i;
  }

  extract(req: VersionedRequest): ExtractionResult | undefined {
    const m = this._pattern.exec(req.path);
    if (!m) return undefined;
    const raw = `v${m[1]}`;
    return { raw, version: m[1], source: 'path' };
  }
}

/** `?version=` / `?api-version=` / `?v=` query parameters. */
export class QueryVersionExtractor implements VersionExtractor {
  readonly name = 'query';
  private readonly _names: ReadonlyArray<string>;

  constructor(names: ReadonlyArray<string> = ['version', 'api-version', 'v']) {
    this._names = names;
  }

  extract(req: VersionedRequest): ExtractionResult | undefined {
    for (const n of this._names) {
      const v = firstQuery(req.query, n);
      if (v !== undefined && v.trim() !== '') {
        return { raw: v.trim(), version: normalizeVersionToken(v), source: 'query' };
      }
    }
    return undefined;
  }
}

/**
 * Vendor media type + `version` parameter:
 *   `Accept: application/vnd.acme.v2+json`           → '2'
 *   `Accept: application/json; version=2.1`          → '2.1'
 *   `Content-Type` is checked too (POSTs negotiate via their body type).
 *
 * Vendor-tree regex: `application/vnd.{vendor}.v{version}+{suffix}` — vendor
 * name is configurable so `vnd.acme` and `vnd.other` can coexist.
 */
export class MediaTypeVersionExtractor implements VersionExtractor {
  readonly name = 'media-type';
  private readonly _vendorRe: RegExp;

  constructor(vendors: ReadonlyArray<string> = []) {
    const v = vendors.length > 0 ? `(?:${vendors.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})` : '[a-z0-9][a-z0-9._-]*';
    this._vendorRe = new RegExp(`application/vnd\\.${v}\\.v(\\d+(?:\\.\\d+)*)\\+`, 'i');
  }

  extract(req: VersionedRequest): ExtractionResult | undefined {
    const accept = firstHeader(req.headers, 'accept') ?? firstHeader(req.headers, 'content-type');
    if (accept === undefined) return undefined;

    // Vendor tree first (higher specificity than a bare `version=` param).
    const vm = this._vendorRe.exec(accept);
    if (vm) {
      return { raw: `v${vm[1]}`, version: vm[1], source: 'media-type' };
    }

    // media-type parameter form: `application/json; version=2`
    for (const part of accept.split(',')) {
      const pm = /;\s*version=([^\s;,]+)/i.exec(part);
      if (pm) {
        return { raw: pm[1], version: normalizeVersionToken(pm[1]), source: 'media-type' };
      }
    }
    return undefined;
  }
}

/**
 * Chain extractors in priority order — first match wins. The default order
 * (media-type → header → path → query) prefers the most *explicit* contract
 * (vendor Accept header) over incidental path shape.
 */
export class CompositeVersionExtractor implements VersionExtractor {
  readonly name = 'composite';
  private readonly _extractors: ReadonlyArray<VersionExtractor>;

  constructor(extractors?: ReadonlyArray<VersionExtractor>) {
    this._extractors = extractors ?? [
      new MediaTypeVersionExtractor(),
      new HeaderVersionExtractor(),
      new UrlPathVersionExtractor(),
      new QueryVersionExtractor(),
    ];
  }

  extract(req: VersionedRequest): ExtractionResult | undefined {
    for (const e of this._extractors) {
      const r = e.extract(req);
      if (r !== undefined) return r;
    }
    return undefined;
  }

  extractors(): ReadonlyArray<VersionExtractor> {
    return this._extractors;
  }
}
