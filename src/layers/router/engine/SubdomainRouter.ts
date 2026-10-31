/**
 * Subdomain Router — host-based dispatch across per-subdomain tables.
 *
 * Each subdomain pattern owns a {@link ConstrainedRouterEngine} — the
 * host variable extraction (compileHostPattern/matchHost) already lives
 * there, so this module only sequences host resolution → table
 * selection → path dispatch.
 *
 * Use cases:
 *   - `{tenant}.app.example.com` → per-tenant route table
 *   - `admin.internal` / `api.internal` → separate admin/api surfaces
 *   - `*.legacy.example.com` → wildcard fallback table
 *
 * Order: buckets are sorted by host specificity descending, so the most
 * literal match wins over wildcards. A request whose host matches no
 * pattern can fall back to a default table (or 404).
 *
 * @module RouterLayer/Engine
 */

import { HttpMethod } from '../types/router-types';
import { ConstrainedRouterEngine, compileHostPattern, matchHost, HostPattern } from './RouteConstraints';
import { ConstrainedRoute } from './RouteConstraints';
import { RouteResult } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subdomain bucket — host pattern + route table. */
export interface SubdomainBucket {
  /** Compiled host pattern. */
  readonly pattern: HostPattern;
  /** Route table serving this subdomain. */
  readonly router: ConstrainedRouterEngine;
  /** Registered route count. */
  readonly routeCount: number;
}

/** Dispatch result enriched with the resolved subdomain variables. */
export interface SubdomainDispatchResult extends RouteResult {
  /** Host variables captured by the matching pattern. */
  readonly hostVars?: Record<string, string>;
  /** Host pattern that dispatched (diagnostics). */
  readonly matchedHostPattern?: string;
  /** Path pattern that dispatched. */
  readonly matchedPattern?: string;
}

/** Options for {@link SubdomainRouter}. */
export interface SubdomainRouterOptions {
  /** Optional default bucket used when no host pattern matches. */
  readonly defaultPattern?: string;
  /** Port is stripped from `Host` before matching (default true). */
  readonly stripPort?: boolean;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Host-dispatched router.
 *
 * One `ConstrainedRouterEngine` per host bucket keeps per-subdomain
 * isolation; the outer array is kept sorted by host specificity so the
 * first matching bucket wins. Complexity per dispatch: O(#buckets ·
 * host-length) for the host scan, then the inner route match.
 */
export class SubdomainRouter {
  private readonly _buckets: SubdomainBucket[];
  private _default: SubdomainBucket | null;
  private readonly _stripPort: boolean;

  constructor(options?: SubdomainRouterOptions) {
    this._buckets = [];
    this._default = null;
    this._stripPort = options?.stripPort ?? true;
    if (options?.defaultPattern !== undefined) {
      this._default = this.makeBucket(options.defaultPattern);
    }
  }

  /** Number of registered subdomain buckets. */
  get bucketCount(): number {
    return this._buckets.length;
  }

  /** Registered host patterns, in match-priority order. */
  patterns(): readonly string[] {
    return this._buckets.map((b) => b.pattern.raw);
  }

  /**
   * Register a route under a host pattern.
   *
   * The bucket is created lazily; buckets are re-sorted so the most
   * specific host pattern is probed first.
   */
  addRoute(hostPattern: string, route: ConstrainedRoute): void {
    // Routes for the default pattern land in the fallback bucket, not
    // in the host-matched list — they'd never match a real host.
    if (this._default !== null && this._default.pattern.raw === hostPattern) {
      this._default.router.addRoute(route);
      return;
    }
    const bucket = this.bucketFor(hostPattern);
    bucket.router.addRoute(route);
  }

  /**
   * Dispatch `(method, path)` using the request's Host header.
   * Returns 404-shaped results, never throws on miss.
   */
  async dispatch(
    method: HttpMethod,
    path: string,
    host: string | undefined,
    headers?: Record<string, string>,
    state?: Record<string, unknown>
  ): Promise<SubdomainDispatchResult> {
    const normalized = this.normalizeHost(host);
    if (normalized !== null) {
      for (const bucket of this._buckets) {
        const hm = matchHost(bucket.pattern, normalized);
        if (hm === null) {
          continue;
        }
        const res = await bucket.router.dispatch(method, path, normalized, headers, state);
        if (res.status !== 404) {
          return { ...res, hostVars: hm.variables, matchedHostPattern: bucket.pattern.raw };
        }
      }
    }
    if (this._default !== null) {
      const res = await this._default.router.dispatch(method, path, normalized ?? '', headers, state);
      if (res.status !== 404) {
        return { ...res, matchedHostPattern: this._default.pattern.raw };
      }
    }
    return { status: 404, body: { error: 'not_found', host: normalized ?? host } };
  }

  /** Dry-run match — finds the bucket + path pattern without invoking handlers. */
  match(
    method: HttpMethod,
    path: string,
    host?: string
  ): { matched: boolean; hostVars?: Record<string, string>; matchedHostPattern?: string } {
    const normalized = this.normalizeHost(host);
    if (normalized !== null) {
      for (const bucket of this._buckets) {
        const hm = matchHost(bucket.pattern, normalized);
        if (hm === null) {
          continue;
        }
        const m = bucket.router.match(method, path, normalized);
        if (m.kind === 'matched') {
          return { matched: true, hostVars: hm.variables, matchedHostPattern: bucket.pattern.raw };
        }
      }
    }
    if (this._default !== null) {
      const m = this._default.router.match(method, path, normalized ?? '');
      if (m.kind === 'matched') {
        return { matched: true, matchedHostPattern: this._default.pattern.raw };
      }
    }
    return { matched: false };
  }

  /** Routes in a given bucket (for introspection). */
  routesInBucket(hostPattern: string): number {
    return this._buckets.find((b) => b.pattern.raw === hostPattern)?.router.routeCount ?? 0;
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private bucketFor(hostPattern: string): SubdomainBucket {
    const existing = this._buckets.find((b) => b.pattern.raw === hostPattern);
    if (existing !== undefined) {
      return existing;
    }
    const bucket = this.makeBucket(hostPattern);
    this._buckets.push(bucket);
    // Keep most-specific first — the linear probe in dispatch relies on it.
    this._buckets.sort((a, b) => b.pattern.specificity - a.pattern.specificity);
    return bucket;
  }

  private makeBucket(hostPattern: string): SubdomainBucket {
    const pattern = compileHostPattern(hostPattern);
    return { pattern, router: new ConstrainedRouterEngine(), routeCount: 0 };
  }

  private normalizeHost(host: string | undefined): string | null {
    if (host === undefined || host === '') {
      return null;
    }
    let h = host.toLowerCase();
    if (this._stripPort) {
      const colon = h.lastIndexOf(':');
      if (colon > 0 && /^\d+$/.test(h.slice(colon + 1))) {
        h = h.slice(0, colon);
      }
    }
    return h;
  }
}
