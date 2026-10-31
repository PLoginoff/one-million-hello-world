/**
 * Route Versioning — versioned route tables with per-route deprecation.
 *
 * Maintains an ordered set of API versions, each backed by its own
 * {@link RadixTrieRouter} table. Version resolution strategies:
 *
 *   - 'path'   — `/v2/users` routes to version `v2` (prefix before the
 *                rest of the path). First path segment selects the table.
 *   - 'header' — `x-api-version: v2` selects the table.
 *   - 'default'— every request lands on the configured default table.
 *
 * Deprecation is per-route and date-driven:
 *   - `deprecatedAt` — start of sunset; requests still served.
 *   - `sunsetAt`     — end of sunset; requests get 410 Gone.
 * Both emit deprecation metadata (Sunset / Deprecation headers per
 * RFC 8594 + draft-ietf-httpapi-deprecation-header) for observability.
 *
 * Fallback: 'latest' resolves a missing versioned route to the highest
 * non-deprecated version that defines it; 'exact' returns 404.
 *
 * @module RouterLayer/Engine
 */

import { HttpMethod } from '../types/router-types';
import { RadixTrieRouter } from './RadixTrieRouter';
import { EngineRoute, MatchResult, RouteResult } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How the engine picks a version for a request. */
export type VersionStrategy = 'path' | 'header' | 'default';

/** Versioned route definition — extends EngineRoute with sunset fields. */
export interface VersionedRoute extends EngineRoute {
  /** Version this route belongs to (`'v1'`, `'v2'`, ...). */
  readonly version: string;
  /** Epoch ms when deprecation starts (RFC 8594 `Deprecation` header). */
  readonly deprecatedAt?: number;
  /** Epoch ms when the route stops serving (410 Gone, `Sunset` header). */
  readonly sunsetAt?: number;
  /** Migration hint surfaced in responses + headers. */
  readonly successor?: string;
}

/** Route record enriched with deprecation state at request time. */
export interface RouteDeprecationInfo {
  readonly deprecated: boolean;
  readonly sunset: boolean;
  readonly successor?: string;
  readonly deprecatedAt?: number;
  readonly sunsetAt?: number;
}

/** Result of versioned dispatch. */
export interface VersionedDispatchResult extends RouteResult {
  /** Version that answered (after fallback). */
  readonly servedByVersion: string;
  /** Whether the route is deprecated at request time. */
  readonly deprecation: RouteDeprecationInfo;
}

/** Options for {@link VersionedRouterEngine}. */
export interface VersionedRouterOptions {
  /** How to resolve versions. */
  readonly strategy: VersionStrategy;
  /** Header name for 'header' strategy (case-insensitive). */
  readonly headerName?: string;
  /** Default version when resolution fails. */
  readonly defaultVersion: string;
  /** 'latest' allows cross-version fallback; 'exact' 404s. */
  readonly fallback?: 'latest' | 'exact';
  /** Clock injection — defaults to Date.now. */
  readonly now?: () => number;
}

/** Versioned-route table statistics. */
export interface VersionTableStats {
  readonly versions: readonly string[];
  readonly routeCount: number;
  readonly deprecatedCount: number;
  readonly sunsetCount: number;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Versioned router engine.
 *
 * One `RadixTrieRouter` per version keeps lookups O(segments) and
 * isolation clean — a `v1` route can't shadow a `v2` route.
 *
 * The engine never mixes tables: even when fallback resolves a `v1`
 * request to a `v2` route, the `servedByVersion` reports where the
 * route actually lives.
 */
export class VersionedRouterEngine {
  private readonly _tables: Map<string, RadixTrieRouter>;
  private readonly _versions: string[];
  private readonly _routeMeta: Map<string, Map<string, VersionedRoute>>;
  private readonly _opts: Required<VersionedRouterOptions>;
  private _hitCounts: Map<string, number>;

  constructor(options: VersionedRouterOptions) {
    this._opts = {
      strategy: options.strategy,
      headerName: options.headerName?.toLowerCase() ?? 'x-api-version',
      defaultVersion: options.defaultVersion,
      fallback: options.fallback ?? 'exact',
      now: options.now ?? (() => Date.now()),
    };
    this._tables = new Map();
    this._versions = [];
    this._routeMeta = new Map();
    this._hitCounts = new Map();
  }

  /** Registered version strings in registration order. */
  get versions(): readonly string[] {
    return this._versions;
  }

  /**
   * Register a versioned route. The version table is created lazily.
   * Path must NOT include the version prefix for 'path' strategy —
   * `/users` not `/v1/users`; the engine strips/selects the prefix.
   */
  addRoute(route: VersionedRoute): void {
    const { version } = route;
    if (!this._tables.has(version)) {
      this._tables.set(version, new RadixTrieRouter());
      this._versions.push(version);
      this._routeMeta.set(version, new Map());
    }
    const table = this._tables.get(version);
    if (table === undefined) {
      throw new Error(`unreachable: missing table for version ${version}`);
    }
    table.addRoute(route);
    const meta = this._routeMeta.get(version);
    if (meta !== undefined) {
      meta.set(routeKey(route.method, route.path), route);
    }
  }

  /**
   * Resolve the request's version without dispatching.
   * For 'path' strategy, the first segment is the version selector.
   * Falls back to the configured default when missing/unknown.
   */
  resolveVersion(path: string, headers?: Record<string, string>): string {
    switch (this._opts.strategy) {
      case 'path': {
        const first = firstSegment(path);
        if (first !== null && this._tables.has(first)) {
          return first;
        }
        return this._opts.defaultVersion;
      }
      case 'header': {
        const header = headers?.[this._opts.headerName];
        if (header !== undefined && this._tables.has(header)) {
          return header;
        }
        return this._opts.defaultVersion;
      }
      case 'default':
        return this._opts.defaultVersion;
    }
  }

  /**
   * Internal: was the version explicitly present in the request path?
   * Path-strategy only — header/default requests always count as
   * implicit so their path is never stripped.
   */
  private versionFromPath(path: string): string | null {
    if (this._opts.strategy !== 'path') {
      return null;
    }
    const first = firstSegment(path);
    return first !== null && this._tables.has(first) ? first : null;
  }

  /**
   * Dispatch through the resolved version table.
   * 404s may fall back to a higher version when `fallback='latest'`.
   */
  async dispatch(
    method: HttpMethod,
    path: string,
    headers?: Record<string, string>,
    state?: Record<string, unknown>
  ): Promise<VersionedDispatchResult> {
    const explicitVersion = this.versionFromPath(path);
    const resolved = explicitVersion ?? this.resolveVersion(path, headers);
    const effectivePath = explicitVersion !== null ? stripFirstSegment(path) : path;

    // Bump per-version hit counter.
    this._hitCounts.set(resolved, (this._hitCounts.get(resolved) ?? 0) + 1);

    const result = await this.dispatchToVersion(resolved, method, effectivePath, headers, state);
    if (result !== null) {
      return result;
    }

    // Fallback: try newer tables in descending registration order.
    if (this._opts.fallback === 'latest') {
      for (let i = this._versions.length - 1; i >= 0; i--) {
        const v = this._versions[i];
        if (v === resolved) {
          continue;
        }
        const alt = await this.dispatchToVersion(v, method, effectivePath, headers, state);
        if (alt !== null) {
          return alt;
        }
      }
    }

    return this.notFound(resolved);
  }

  /** Match without invoking handlers — dry-run for diagnostics. */
  match(method: HttpMethod, path: string, headers?: Record<string, string>): MatchResult & { resolvedVersion: string } {
    const explicitVersion = this.versionFromPath(path);
    const resolved = explicitVersion ?? this.resolveVersion(path, headers);
    const effectivePath = explicitVersion !== null ? stripFirstSegment(path) : path;
    const table = this._tables.get(resolved);
    const match = table?.match(method, effectivePath) ?? { kind: 'not_found' as const };
    return { ...match, resolvedVersion: resolved };
  }

  /** Per-version request counters (in-memory, reset on hot-swap). */
  versionHits(version: string): number {
    return this._hitCounts.get(version) ?? 0;
  }

  /** Aggregate stats. */
  stats(): VersionTableStats {
    let routeCount = 0;
    let deprecatedCount = 0;
    let sunsetCount = 0;
    const now = this._opts.now();
    for (const meta of this._routeMeta.values()) {
      routeCount += meta.size;
      for (const route of meta.values()) {
        if (route.deprecatedAt !== undefined && route.deprecatedAt <= now) {
          deprecatedCount++;
        }
        if (route.sunsetAt !== undefined && route.sunsetAt <= now) {
          sunsetCount++;
        }
      }
    }
    return { versions: this._versions, routeCount, deprecatedCount, sunsetCount };
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private async dispatchToVersion(
    version: string,
    method: HttpMethod,
    path: string,
    headers: Record<string, string> | undefined,
    state: Record<string, unknown> | undefined
  ): Promise<VersionedDispatchResult | null> {
    const table = this._tables.get(version);
    if (table === undefined) {
      return null;
    }
    const result = await table.dispatch(method, path, headers, state);
    if (result.status === 404) {
      return null;
    }

    const deprecation = this.deprecationFor(version, method, result.matchedPattern ?? path);
    const headersWithSunset = { ...(result.headers ?? {}) };
    if (deprecation.deprecated) {
      headersWithSunset.deprecation = 'true';
      if (deprecation.sunsetAt !== undefined) {
        headersWithSunset.sunset = new Date(deprecation.sunsetAt).toUTCString();
      }
      if (deprecation.successor !== undefined) {
        headersWithSunset.link = `<${deprecation.successor}>; rel="successor-version"`;
      }
    }
    if (deprecation.sunset) {
      return {
        status: 410,
        body: { error: 'route_sunset', successor: deprecation.successor },
        headers: headersWithSunset,
        servedByVersion: version,
        deprecation,
      };
    }
    return {
      ...result,
      headers: headersWithSunset,
      servedByVersion: version,
      deprecation,
    };
  }

  private deprecationFor(version: string, method: HttpMethod, pattern: string): RouteDeprecationInfo {
    const meta = this._routeMeta.get(version)?.get(routeKey(method, pattern));
    const now = this._opts.now();
    const deprecated = meta?.deprecatedAt !== undefined && meta.deprecatedAt <= now;
    const sunset = meta?.sunsetAt !== undefined && meta.sunsetAt <= now;
    return {
      deprecated,
      sunset,
      successor: meta?.successor,
      deprecatedAt: meta?.deprecatedAt,
      sunsetAt: meta?.sunsetAt,
    };
  }

  private notFound(version: string): VersionedDispatchResult {
    return {
      status: 404,
      body: { error: 'not_found', version },
      servedByVersion: version,
      deprecation: { deprecated: false, sunset: false },
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function routeKey(method: HttpMethod, path: string): string {
  return `${method} ${path}`;
}

function firstSegment(path: string): string | null {
  const m = /^\/([^/]+)/.exec(path);
  return m?.[1] ?? null;
}

function stripFirstSegment(path: string): string {
  const m = /^\/[^/]+(.*)/.exec(path);
  const rest = m?.[1] ?? '';
  return rest === '' ? '/' : rest;
}
